import { describe, expect, test, vi } from 'vitest';

import type { JiraAssignedIssue, JiraIssueActivityEntry } from './jiraClient';
import { NotificationPoller } from './notificationPoller';
import type { JiraOpsSettings } from './jiraOpsSettings';
import type { IssueUpdateNotificationResult } from './jiraNotifications';

function assignedIssue(key: string, updated: string): JiraAssignedIssue {
  return {
    assigneeDisplayName: null,
    reporterDisplayName: null,
    issueType: 'Bug',
    key,
    summary: 'Ticket summary hidden from logs',
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'High',
    updated,
  };
}

function changelogActivity(field = 'WorklogId'): JiraIssueActivityEntry {
  return {
    authorDisplayName: 'Current User',
    created: '2026-05-01T08:24:00.000Z',
    id: `activity-${field}`,
    items: [{ field, fromString: null, toString: field === 'status' ? 'In Progress' : '10001' }],
    type: 'changelog',
  };
}

function commentActivity(): JiraIssueActivityEntry {
  return {
    authorDisplayName: 'Release Manager',
    created: '2026-05-01T08:23:00.000Z',
    id: 'comment-20001',
    type: 'comment',
    updated: '2026-05-01T08:23:00.000Z',
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

  test('creates activity notifications for changed issues', async () => {
    const logs: string[] = [];
    const results: IssueUpdateNotificationResult[] = [];
    const fetchIssueActivities = vi.fn((issueKey: string) => {
      return Promise.resolve(
        issueKey === 'OPS-123' ? [commentActivity(), changelogActivity()] : []
      );
    });
    const poller = new NotificationPoller({
      fetchIssueActivities,
      fetchIssues: () =>
        Promise.resolve([
          assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z'),
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

    expect(fetchIssueActivities).toHaveBeenCalledTimes(1);
    expect(fetchIssueActivities).toHaveBeenCalledWith('OPS-123');
    expect(results[0]?.newNotifications.map((notification) => notification.title)).toEqual([
      'Current User updated Bug OPS-123',
      'Release Manager commented on Bug OPS-123',
    ]);
    expect(results[0]?.newNotifications[0]?.detail).toBe(
      'Logged work · Ticket summary hidden from logs'
    );
    expect(logs.join('\n')).toContain(
      'Jira activity enrichment finished: attempted=1, activityNotifications=2, fallback=0, suppressed=0.'
    );
    expect(logs.join('\n')).not.toContain('Ticket summary hidden from logs');
    expect(logs.join('\n')).not.toContain('Current User');
    expect(logs.join('\n')).not.toContain('Release Manager');
  });

  test('keeps fallback notification copy when activity enrichment fails', async () => {
    const logs: string[] = [];
    const results: IssueUpdateNotificationResult[] = [];
    const poller = new NotificationPoller({
      fetchIssueActivities: () => Promise.reject(new Error('Jira unavailable')),
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
      'Jira activity enrichment finished: attempted=1, activityNotifications=0, fallback=1, suppressed=0.'
    );
  });



  test('suppresses updated notifications when Jira activity feed has nothing new', async () => {
    const logs: string[] = [];
    const results: IssueUpdateNotificationResult[] = [];
    const poller = new NotificationPoller({
      fetchIssueActivities: () => Promise.resolve([]),
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

    expect(results[0]?.newNotifications).toEqual([]);
    expect(logs.join('\n')).toContain(
      'Jira activity enrichment finished: attempted=1, activityNotifications=0, fallback=0, suppressed=1.'
    );
  });
  test('uses activity copy for newly relevant issues after baseline', async () => {
    const results: IssueUpdateNotificationResult[] = [];
    const fetchIssueActivities = vi.fn(() =>
      Promise.resolve([changelogActivity('status')])
    );
    const poller = new NotificationPoller({
      fetchIssueActivities,
      fetchIssues: () =>
        Promise.resolve([
          assignedIssue('OPS-123', '2026-05-01T08:20:00.000Z'),
          assignedIssue('OPS-777', '2026-05-01T08:24:00.000Z'),
        ]),
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
      notifications: [],
    });

    await expect(poller.pollNow('manual')).resolves.toBe(true);

    expect(fetchIssueActivities).toHaveBeenCalledWith('OPS-777');
    expect(results[0]?.newNotifications[0]).toMatchObject({
      detail: 'Changed status to In Progress · Ticket summary hidden from logs',
      title: 'Current User updated Bug OPS-777',
    });
  });

  test('limits activity enrichment concurrency to five requests', async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const updatedIssues = Array.from({ length: 6 }, (_, index) => {
      return assignedIssue(`OPS-${String(index + 100)}`, '2026-05-01T08:24:00.000Z');
    });
    const poller = new NotificationPoller({
      fetchIssueActivities: async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        activeRequests -= 1;
        return [changelogActivity('status')];
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
