import { describe, expect, test } from 'vitest';

import type { JiraAssignedIssue, JiraIssueChangelogEntry } from './jiraClient';
import {
  JIRA_OPS_NOTIFICATION_STATE_KEY,
  computeIssueUpdateNotifications,
  createIssueNotification,
  describeChangelogAction,
  formatNotificationLogSummary,
  getUnreadNotificationCount,
  enrichIssueUpdateNotification,
  markAllNotificationsRead,
  normalizeJiraOpsNotificationState,
  readJiraOpsNotificationState,
  rebuildAssignedIssueNotificationHistory,
  seedAssignedIssueNotificationHistory,
  writeJiraOpsNotificationState,
} from './jiraNotifications';

function assignedIssue(
  key: string,
  updated: string,
  summary = 'Sensitive customer escalation summary',
  issueType = 'Bug'
): JiraAssignedIssue {
  return {
    assigneeDisplayName: null,
    issueType,
    key,
    summary,
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'High',
    updated,
  };
}

class MemoryMemento {
  private readonly values: Record<string, unknown> = {};

  public get(key: string): unknown {
    return this.values[key];
  }

  public update(key: string, value: unknown): Promise<void> {
    this.values[key] = value;
    return Promise.resolve();
  }
}

describe('JiraOps assigned issue notifications', () => {
  test('describes real Jira changelog field combinations by user value', () => {
    expect(describeChangelogAction([{ field: 'WorklogId', fromString: null, toString: '10001' }])).toBe('Logged work');
    expect(describeChangelogAction([{ field: 'timespent', fromString: null, toString: '1800' }])).toBe('Logged work');
    expect(describeChangelogAction([{ field: 'status', fromString: 'To Do', toString: 'In Progress' }])).toBe('Changed status to In Progress');
    expect(describeChangelogAction([{ field: 'assignee', fromString: 'Current User', toString: 'Release Manager' }])).toBe('Reassigned to Release Manager');
    expect(describeChangelogAction([{ field: 'Attachment', fromString: null, toString: 'diagram.png' }])).toBe('Added an attachment');
    expect(describeChangelogAction([{ field: 'comment', fromString: null, toString: null }])).toBe('Added a comment');
    expect(describeChangelogAction([{ field: 'summary', fromString: 'Old title', toString: 'New title' }])).toBe('Updated the title');
    expect(describeChangelogAction([{ field: 'description', fromString: null, toString: null }])).toBe('Updated the description');
    expect(describeChangelogAction([{ field: 'priority', fromString: 'Low', toString: 'High' }])).toBe('Changed priority to High');
    expect(describeChangelogAction([{ field: 'resolution', fromString: null, toString: 'Done' }])).toBe('Resolved the issue');
    expect(describeChangelogAction([{ field: 'labels', fromString: null, toString: 'ops' }])).toBe('Made changes');
  });

  test('prioritizes logged work when a changelog entry contains multiple items', () => {
    expect(
      describeChangelogAction([
        { field: 'timeestimate', fromString: '2h', toString: '1h' },
        { field: 'timespent', fromString: null, toString: '1800' },
        { field: 'status', fromString: 'To Do', toString: 'In Progress' },
      ])
    ).toBe('Logged work');
  });

  test('creates enriched updated, fallback updated, and assigned notification copy', () => {
    const issue = assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z', 'Payment incident runbook');
    const changelog: JiraIssueChangelogEntry = {
      authorDisplayName: 'Current User',
      created: '2026-05-01T08:24:00.000Z',
      items: [{ field: 'WorklogId', fromString: null, toString: '10001' }],
    };

    expect(createIssueNotification(issue, 'updated', changelog)).toMatchObject({
      title: 'Current User updated Bug OPS-123',
      detail: 'Logged work · Payment incident runbook',
      unread: true,
    });
    expect(createIssueNotification(issue, 'updated', null)).toMatchObject({
      title: 'OPS-123 Bug was updated',
      detail: 'Payment incident runbook',
    });
    expect(createIssueNotification(issue, 'assigned', null)).toMatchObject({
      title: 'New Bug assigned: OPS-123',
      detail: 'Payment incident runbook',
    });
  });

  test('falls back to a neutral issue type for legacy issue-shaped inputs', () => {
    const legacyIssue = {
      assigneeDisplayName: null,
      key: 'OPS-123',
      priority: 'High',
      status: 'In Progress',
      statusCategory: 'In Progress',
      summary: 'Payment incident runbook',
      updated: '2026-05-01T08:24:00.000Z',
    } as unknown as JiraAssignedIssue;

    expect(createIssueNotification(legacyIssue, 'updated', null).title).toBe(
      'OPS-123 Issue was updated'
    );
  });

  test('creates a baseline without unread notifications on the first poll', () => {
    const result = computeIssueUpdateNotifications({
      existingNotifications: [],
      issues: [assignedIssue('OPS-123', '2026-05-01T08:20:00.000Z')],
      previousBaseline: {},
    });

    expect(result.newNotifications).toEqual([]);
    expect(result.nextBaseline).toEqual({
      'OPS-123': '2026-05-01T08:20:00.000Z',
    });
  });

  test('creates one unread item when an assigned issue is updated after baseline', () => {
    const result = computeIssueUpdateNotifications({
      existingNotifications: [],
      issues: [assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')],
      previousBaseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
    });

    expect(result.newNotifications).toHaveLength(1);
    expect(result.newNotifications[0]).toMatchObject({
      id: 'OPS-123:2026-05-01T08:24:00.000Z',
      issueKey: 'OPS-123',
      detail: 'Sensitive customer escalation summary',
      title: 'OPS-123 Bug was updated',
      unread: true,
    });
    expect(getUnreadNotificationCount(result.notifications)).toBe(1);
  });

  test('does not duplicate an existing notification for the same issue timestamp', () => {
    const first = computeIssueUpdateNotifications({
      existingNotifications: [],
      issues: [assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')],
      previousBaseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
    });
    const second = computeIssueUpdateNotifications({
      existingNotifications: first.notifications,
      issues: [assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')],
      previousBaseline: first.nextBaseline,
    });

    expect(second.newNotifications).toEqual([]);
    expect(second.notifications).toHaveLength(1);
  });

  test('treats a newly assigned issue after baseline as unread', () => {
    const result = computeIssueUpdateNotifications({
      existingNotifications: [],
      issues: [
        assignedIssue('OPS-123', '2026-05-01T08:20:00.000Z'),
        assignedIssue('OPS-456', '2026-05-01T08:25:00.000Z'),
      ],
      previousBaseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
    });

    expect(result.newNotifications).toHaveLength(1);
    expect(result.newNotifications[0]?.title).toBe('New Bug assigned: OPS-456');
  });

  test('keeps issue summaries out of output log summaries', () => {
    const result = computeIssueUpdateNotifications({
      existingNotifications: [],
      issues: [assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')],
      previousBaseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
    });

    const logSummary = formatNotificationLogSummary(result.newNotifications);
    expect(logSummary).toContain('OPS-123');
    expect(logSummary).not.toContain('Sensitive customer escalation summary');
  });

  test('marks all notifications as read without removing history', () => {
    const result = computeIssueUpdateNotifications({
      existingNotifications: [],
      issues: [assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')],
      previousBaseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
    });

    const readNotifications = markAllNotificationsRead(result.notifications);
    expect(readNotifications).toHaveLength(1);
    expect(getUnreadNotificationCount(readNotifications)).toBe(0);
  });

  test('seeds assigned issue notification history as read items with issue type context', () => {
    const notifications = seedAssignedIssueNotificationHistory({
      existingNotifications: [],
      issues: [
        assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z'),
        assignedIssue('OPS-456', '2026-05-01T08:18:00.000Z', 'Another sensitive summary'),
      ],
    });

    expect(notifications).toEqual([
      {
        id: 'OPS-123:2026-05-01T08:24:00.000Z',
        issueKey: 'OPS-123',
        title: 'OPS-123 Bug assigned issue activity',
        detail: 'Sensitive customer escalation summary',
        updated: '2026-05-01T08:24:00.000Z',
        unread: false,
      },
      {
        id: 'OPS-456:2026-05-01T08:18:00.000Z',
        issueKey: 'OPS-456',
        title: 'OPS-456 Bug assigned issue activity',
        detail: 'Another sensitive summary',
        updated: '2026-05-01T08:18:00.000Z',
        unread: false,
      },
    ]);
  });

  test('does not duplicate seeded history already stored for the same timestamp', () => {
    const existing = [
      {
        id: 'OPS-123:2026-05-01T08:24:00.000Z',
        issueKey: 'OPS-123',
        title: 'OPS-123 Bug assigned issue activity',
        detail: 'Sensitive customer escalation summary',
        updated: '2026-05-01T08:24:00.000Z',
        unread: false,
      },
    ];

    const notifications = seedAssignedIssueNotificationHistory({
      existingNotifications: existing,
      issues: [assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')],
    });

    expect(notifications).toEqual(existing);
  });

  test('rebuilds the latest 30 assigned issue notifications with changelog enrichment', async () => {
    const issues = Array.from({ length: 31 }, (_, index) => {
      const issueNumber = 100 + index;
      return assignedIssue(
        `OPS-${String(issueNumber)}`,
        `2026-05-${String(index + 1).padStart(2, '0')}T08:24:00.000Z`,
        `Reloaded summary ${String(issueNumber)}`,
        index === 30 ? 'Task' : 'Bug'
      );
    });
    const notifications = await rebuildAssignedIssueNotificationHistory({
      fetchIssueChangelog: (issueKey) =>
        Promise.resolve(
          issueKey === 'OPS-130'
            ? {
                authorDisplayName: 'Current User',
                created: '2026-05-31T08:24:00.000Z',
                items: [
                  { field: 'status', fromString: 'To Do', toString: 'In Progress' },
                ],
              }
            : null
        ),
      issues,
    });

    expect(notifications).toHaveLength(30);
    expect(notifications[0]).toEqual({
      id: 'OPS-130:2026-05-31T08:24:00.000Z',
      issueKey: 'OPS-130',
      title: 'Current User updated Task OPS-130',
      detail: 'Changed status to In Progress · Reloaded summary 130',
      updated: '2026-05-31T08:24:00.000Z',
      unread: false,
    });
    expect(notifications[notifications.length - 1]?.issueKey).toBe('OPS-101');
    expect(notifications.some((notification) => notification.issueKey === 'OPS-100')).toBe(false);
    expect(notifications.every((notification) => !notification.unread)).toBe(true);
  });

  test('normalizes persisted notification history and baseline safely', () => {
    expect(
      normalizeJiraOpsNotificationState({
        baseline: {
          'OPS-123': '2026-05-01T08:20:00.000Z',
          malformed: 123,
        },
        notifications: [
          {
            id: 'OPS-123:2026-05-01T08:24:00.000Z',
            issueKey: 'OPS-123',
            title: 'OPS-123 Bug was updated',
            detail: 'Sensitive customer escalation summary',
            updated: '2026-05-01T08:24:00.000Z',
            unread: true,
            summary: 'Sensitive customer escalation summary',
          },
          {
            id: '',
            issueKey: 'OPS-456',
            title: 'Invalid',
            detail: 'Invalid',
            updated: '2026-05-01T08:24:00.000Z',
            unread: true,
          },
        ],
      })
    ).toEqual({
      baseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
      notifications: [
        {
          id: 'OPS-123:2026-05-01T08:24:00.000Z',
          issueKey: 'OPS-123',
          title: 'OPS-123 Bug was updated',
          detail: 'Sensitive customer escalation summary',
          updated: '2026-05-01T08:24:00.000Z',
          unread: true,
        },
      ],
    });
  });

  test('enriches an updated notification without changing identity or read state', () => {
    const issue = assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z', 'Payment incident runbook');
    const changelog: JiraIssueChangelogEntry = {
      authorDisplayName: 'Current User',
      created: '2026-05-01T08:24:00.000Z',
      items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }],
    };

    expect(
      enrichIssueUpdateNotification(
        {
          id: 'OPS-123:2026-05-01T08:24:00.000Z',
          issueKey: 'OPS-123',
          title: 'OPS-123 Bug was updated',
          detail: 'Payment incident runbook',
          updated: '2026-05-01T08:24:00.000Z',
          unread: false,
        },
        issue,
        changelog
      )
    ).toEqual({
      id: 'OPS-123:2026-05-01T08:24:00.000Z',
      issueKey: 'OPS-123',
      title: 'Current User updated Bug OPS-123',
      detail: 'Changed status to In Progress · Payment incident runbook',
      updated: '2026-05-01T08:24:00.000Z',
      unread: false,
    });
  });

  test('persists notification detail without preserving extra summary fields', async () => {
    const memento = new MemoryMemento();
    const notification = computeIssueUpdateNotifications({
      existingNotifications: [],
      issues: [assignedIssue('OPS-123', '2026-05-01T08:24:00.000Z')],
      previousBaseline: {
        'OPS-123': '2026-05-01T08:20:00.000Z',
      },
    });

    await writeJiraOpsNotificationState(memento, {
      baseline: notification.nextBaseline,
      notifications: notification.notifications,
    });

    const persisted = memento.get(JIRA_OPS_NOTIFICATION_STATE_KEY);
    expect(JSON.stringify(persisted)).not.toContain('"summary"');
    expect(readJiraOpsNotificationState(memento)).toEqual({
      baseline: {
        'OPS-123': '2026-05-01T08:24:00.000Z',
      },
      notifications: notification.notifications,
    });
  });
});
