import type { JiraAssignedIssue } from './jiraClient';

const MAX_NOTIFICATION_HISTORY = 30;

export interface JiraOpsNotification {
  readonly id: string;
  readonly issueKey: string;
  readonly title: string;
  readonly detail: string;
  readonly updated: string;
  readonly unread: boolean;
}

export type IssueUpdateBaseline = Record<string, string>;

export interface ComputeIssueUpdateNotificationsOptions {
  readonly existingNotifications: readonly JiraOpsNotification[];
  readonly hasPreviousBaseline?: boolean;
  readonly issues: readonly JiraAssignedIssue[];
  readonly previousBaseline: IssueUpdateBaseline;
}

export interface IssueUpdateNotificationResult {
  readonly nextBaseline: IssueUpdateBaseline;
  readonly newNotifications: readonly JiraOpsNotification[];
  readonly notifications: readonly JiraOpsNotification[];
}

export function computeIssueUpdateNotifications(
  options: ComputeIssueUpdateNotificationsOptions
): IssueUpdateNotificationResult {
  const nextBaseline = buildIssueUpdateBaseline(options.issues);
  const knownNotificationIds = new Set(
    options.existingNotifications.map((notification) => notification.id)
  );
  const newNotifications = options.issues
    .map((issue) =>
      createNotificationForIssue(
        issue,
        options.previousBaseline,
        options.hasPreviousBaseline === true
      )
    )
    .filter((notification): notification is JiraOpsNotification => {
      return notification !== null && !knownNotificationIds.has(notification.id);
    });

  return {
    nextBaseline,
    newNotifications,
    notifications: [...newNotifications, ...options.existingNotifications].slice(
      0,
      MAX_NOTIFICATION_HISTORY
    ),
  };
}

export function buildIssueUpdateBaseline(
  issues: readonly JiraAssignedIssue[]
): IssueUpdateBaseline {
  const baseline: IssueUpdateBaseline = {};
  for (const issue of issues) {
    baseline[issue.key] = issue.updated;
  }
  return baseline;
}

export function getUnreadNotificationCount(
  notifications: readonly JiraOpsNotification[]
): number {
  return notifications.filter((notification) => notification.unread).length;
}

export function markAllNotificationsRead(
  notifications: readonly JiraOpsNotification[]
): readonly JiraOpsNotification[] {
  return notifications.map((notification) => ({
    ...notification,
    unread: false,
  }));
}

export function markIssueNotificationsRead(
  notifications: readonly JiraOpsNotification[],
  issueKey: string
): readonly JiraOpsNotification[] {
  return notifications.map((notification) => ({
    ...notification,
    unread: notification.issueKey === issueKey ? false : notification.unread,
  }));
}

export function formatNotificationLogSummary(
  notifications: readonly JiraOpsNotification[]
): string {
  if (notifications.length === 0) {
    return 'No new assigned issue updates.';
  }

  const issueKeys = notifications.map((notification) => notification.issueKey);
  return `Detected ${String(notifications.length)} assigned issue update(s): ${issueKeys.join(', ')}.`;
}

function createNotificationForIssue(
  issue: JiraAssignedIssue,
  previousBaseline: IssueUpdateBaseline,
  hasPreviousBaseline: boolean
): JiraOpsNotification | null {
  const previousUpdated = previousBaseline[issue.key];
  if (previousUpdated === undefined) {
    if (!hasPreviousBaseline && Object.keys(previousBaseline).length === 0) {
      return null;
    }

    return createIssueNotification(issue, 'assigned');
  }

  if (!isNewerTimestamp(issue.updated, previousUpdated)) {
    return null;
  }

  return createIssueNotification(issue, 'updated');
}

function createIssueNotification(
  issue: JiraAssignedIssue,
  reason: 'assigned' | 'updated'
): JiraOpsNotification {
  const reasonText = reason === 'assigned' ? 'assigned' : 'updated';
  return {
    detail:
      reason === 'assigned'
        ? 'A new issue is assigned to you.'
        : 'Assigned issue update detected by JiraOps.',
    id: `${issue.key}:${issue.updated}`,
    issueKey: issue.key,
    title: `${issue.key} was ${reasonText}`,
    unread: true,
    updated: issue.updated,
  };
}

function isNewerTimestamp(nextValue: string, previousValue: string): boolean {
  const nextTime = Date.parse(nextValue);
  const previousTime = Date.parse(previousValue);
  if (Number.isNaN(nextTime) || Number.isNaN(previousTime)) {
    return nextValue !== previousValue;
  }

  return nextTime > previousTime;
}
