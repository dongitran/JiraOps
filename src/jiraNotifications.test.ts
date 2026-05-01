import { describe, expect, test } from 'vitest';

import type { JiraAssignedIssue } from './jiraClient';
import {
  computeIssueUpdateNotifications,
  formatNotificationLogSummary,
  getUnreadNotificationCount,
  markAllNotificationsRead,
} from './jiraNotifications';

function assignedIssue(
  key: string,
  updated: string,
  summary = 'Sensitive customer escalation summary'
): JiraAssignedIssue {
  return {
    assigneeDisplayName: null,
    key,
    summary,
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'High',
    updated,
  };
}

describe('JiraOps assigned issue notifications', () => {
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
      title: 'OPS-123 was updated',
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
    expect(result.newNotifications[0]?.title).toBe('OPS-456 was assigned');
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
});
