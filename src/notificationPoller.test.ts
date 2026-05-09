import { describe, expect, test, vi } from 'vitest';

import type { JiraAssignedIssue, JiraIssueChangelogEntry } from './jiraClient';
import { NotificationPoller } from './notificationPoller';
import type { JiraOpsSettings } from './jiraOpsSettings';
import type { IssueUpdateNotificationResult } from './jiraNotifications';

function assignedIssue(key: string, updated: string): JiraAssignedIssue {
  return {
    assigneeDisplayName: null,
    issueType: 'Bug',
    key,
    summary: 'Ticket summary hidden from logs',
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'High',
    updated,
  };
}

function changelogEntry(field = 'WorklogId'): JiraIssueChangelogEntry {
  return {
    authorDisplayName: 'Current User',
    created: '2026-05-01T08:24:00.000Z',
    items: [{ field, fromString: null, toString: '10001' }],
  };
}

function defaultSettings(): JiraOpsSettings {
  return {
    notificationsEnabled: true,
    notificationPollIntervalMinutes: 1,
  };
}

describe('NotificationPoller', () => {
  test('updates the dashboard from the same fetched assigned issues', async () => {
    const onIssues = vi.fn<(issues: readonly JiraAssignedIssue[]) => void>();
    const onNotifications = vi.fn<(result: IssueUpdateNotificationResult) => void>();
    const poller = new NotificationPoller({
      fetchIssues: () =>
        Promise.resolve([assignedIssue('OPS-123', '2026-05-01T08:20:00.000Z')]),
      log: () => undefined,
      onError: () => undefined,
      onIssues,
      onNotifications,
      readSettings: () => Promise.resolve(defaultSettings()),
    });

    await expect(poller.pollNow('manual')).resolves.toBe(true);
    expect(onIssues).toHaveBeenCalledWith([
      assignedIssue('OPS-123', '2026-05-01T08:20:00.000Z'),
    ]);
    expect(onNotifications).toHaveBeenCalledTimes(1);
  });

  test('suppresses overlapping poll attempts', async () => {
    const releaseFetchRef: { current: (() => void) | null } = { current: null };
    const fetchIssues = vi.fn<() => Promise<readonly JiraAssignedIssue[]>>(
      () =>
        new Promise((resolve) => {
          releaseFetchRef.current = () => {
            resolve([assignedIssue('OPS-123', '2026-05-01T08:20:00.000Z')]);
          };
        })
    );
    const poller = new NotificationPoller({
      fetchIssues,
      log: () => undefined,
      onError: () => undefined,
      onIssues: () => undefined,
      onNotifications: () => undefined,
      readSettings: () => Promise.resolve(defaultSettings()),
    });

    const firstPoll = poller.pollNow('manual');
    await expect(poller.pollNow('manual')).resolves.toBe(false);
    expect(fetchIssues).toHaveBeenCalledTimes(1);

    releaseFetchRef.current?.();
    await expect(firstPoll).resolves.toBe(true);
  });

  test('keeps previous notification state when a poll fails', async () => {
    const errors: string[] = [];
    const onNotifications = vi.fn();
    const poller = new NotificationPoller({
      fetchIssues: () => Promise.reject(new Error('network unavailable')),
      log: () => undefined,
      onError: (error) => {
        errors.push(error instanceof Error ? error.message : String(error));
      },
      onIssues: () => undefined,
      onNotifications,
      readSettings: () => Promise.resolve(defaultSettings()),
    });

    await expect(poller.pollNow('manual')).resolves.toBe(false);
    expect(onNotifications).not.toHaveBeenCalled();
    expect(errors).toEqual(['network unavailable']);
  });

  test('restores old notifications and baseline before polling', async () => {
    const results: IssueUpdateNotificationResult[] = [];
    const poller = new NotificationPoller({
      fetchIssues: () =>
        Promise.resolve([assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')]),
      log: () => undefined,
      onError: () => undefined,
      onIssues: () => undefined,
      onNotifications: (result) => {
        results.push(result);
      },
      readSettings: () => Promise.resolve(defaultSettings()),
    });
    poller.restore({
      baseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
      notifications: [
        {
          id: 'OPS-456:2026-05-01T08:18:00.000Z',
          issueKey: 'OPS-456',
          title: 'OPS-456 was updated',
          detail: 'Assigned issue update detected by JiraOps.',
          updated: '2026-05-01T08:18:00.000Z',
          unread: true,
        },
      ],
    });

    await expect(poller.pollNow('manual')).resolves.toBe(true);
    const result = results[0];
    expect(result?.notifications.filter((item) => item.unread).map((item) => item.issueKey).sort()).toEqual([
      'OPS-123',
      'OPS-456',
    ]);
  });

  test('enriches only new updated notifications with changelog details', async () => {
    const logs: string[] = [];
    const results: IssueUpdateNotificationResult[] = [];
    const fetchIssueChangelog = vi.fn((issueKey: string) => {
      return Promise.resolve(issueKey === 'OPS-123' ? changelogEntry() : null);
    });
    const poller = new NotificationPoller({
      fetchIssueChangelog,
      fetchIssues: () =>
        Promise.resolve([
          assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z'),
          assignedIssue('OPS-456', '2026-05-01T08:25:00.000Z'),
        ]),
      log: (message) => {
        logs.push(message);
      },
      onError: () => undefined,
      onIssues: () => undefined,
      onNotifications: (result) => {
        results.push(result);
      },
      readSettings: () => Promise.resolve(defaultSettings()),
    });
    poller.restore({
      baseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
      notifications: [],
    });

    await expect(poller.pollNow('manual')).resolves.toBe(true);

    expect(fetchIssueChangelog).toHaveBeenCalledTimes(1);
    expect(fetchIssueChangelog).toHaveBeenCalledWith('OPS-123');
    expect(results[0]?.newNotifications.map((notification) => notification.title)).toEqual([
      'Current User updated Bug OPS-123',
      'New Bug assigned: OPS-456',
    ]);
    expect(results[0]?.newNotifications[0]?.detail).toBe(
      'Logged work · Ticket summary hidden from logs'
    );
    expect(logs.join('\n')).toContain(
      'Jira changelog enrichment finished: attempted=1, enriched=1, fallback=0.'
    );
    expect(logs.join('\n')).not.toContain('Ticket summary hidden from logs');
    expect(logs.join('\n')).not.toContain('Current User');
  });

  test('keeps fallback notification copy when changelog enrichment fails', async () => {
    const logs: string[] = [];
    const results: IssueUpdateNotificationResult[] = [];
    const poller = new NotificationPoller({
      fetchIssueChangelog: () => Promise.reject(new Error('Jira unavailable')),
      fetchIssues: () =>
        Promise.resolve([assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')]),
      log: (message) => {
        logs.push(message);
      },
      onError: () => undefined,
      onIssues: () => undefined,
      onNotifications: (result) => {
        results.push(result);
      },
      readSettings: () => Promise.resolve(defaultSettings()),
    });
    poller.restore({
      baseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
      notifications: [],
    });

    await expect(poller.pollNow('manual')).resolves.toBe(true);

    expect(results[0]?.newNotifications[0]).toMatchObject({
      title: 'OPS-123 Bug was updated',
      detail: 'Ticket summary hidden from logs',
    });
    expect(logs.join('\n')).toContain(
      'Jira changelog enrichment finished: attempted=1, enriched=0, fallback=1.'
    );
  });

  test('limits changelog enrichment concurrency to five requests', async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const updatedIssues = Array.from({ length: 6 }, (_, index) => {
      return assignedIssue(`OPS-${String(index + 100)}`, '2026-05-01T08:24:00.000Z');
    });
    const poller = new NotificationPoller({
      fetchIssueChangelog: async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        activeRequests -= 1;
        return changelogEntry('status');
      },
      fetchIssues: () => Promise.resolve(updatedIssues),
      log: () => undefined,
      onError: () => undefined,
      onIssues: () => undefined,
      onNotifications: () => undefined,
      readSettings: () => Promise.resolve(defaultSettings()),
    });
    poller.restore({
      baseline: Object.fromEntries(
        updatedIssues.map((issue) => [issue.key, '2026-05-01T08:20:00.000Z'])
      ),
      notifications: [],
    });

    await expect(poller.pollNow('manual')).resolves.toBe(true);

    expect(maxActiveRequests).toBe(5);
  });

  test('uses the configured interval for scheduled polling', async () => {
    vi.useFakeTimers();
    const fetchIssues = vi.fn(() =>
      Promise.resolve([assignedIssue('OPS-123', '2026-05-01T08:20:00.000Z')])
    );
    const poller = new NotificationPoller({
      fetchIssues,
      log: () => undefined,
      onError: () => undefined,
      onIssues: () => undefined,
      onNotifications: () => undefined,
      readSettings: () =>
        Promise.resolve({
          notificationsEnabled: true,
          notificationPollIntervalMinutes: 2,
        }),
    });

    await poller.start();
    expect(fetchIssues).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(119_000);
    expect(fetchIssues).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchIssues).toHaveBeenCalledTimes(2);

    poller.dispose();
    vi.useRealTimers();
  });
});
