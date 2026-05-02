import { describe, expect, test, vi } from 'vitest';

import type { JiraAssignedIssue } from './jiraClient';
import { NotificationPoller } from './notificationPoller';
import type { JiraOpsSettings } from './jiraOpsSettings';
import type { IssueUpdateNotificationResult } from './jiraNotifications';

function assignedIssue(key: string, updated: string): JiraAssignedIssue {
  return {
    assigneeDisplayName: null,
    key,
    summary: 'Ticket summary hidden from logs',
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'High',
    updated,
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
