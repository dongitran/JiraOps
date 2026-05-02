import type { JiraAssignedIssue } from './jiraClient';

const MAX_NOTIFICATION_HISTORY = 30;
export const JIRA_OPS_NOTIFICATION_STATE_KEY = 'jiraOps.notifications.v1';

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

export interface JiraOpsNotificationState {
  readonly baseline: IssueUpdateBaseline;
  readonly notifications: readonly JiraOpsNotification[];
}

export interface JiraOpsNotificationMemento {
  get(key: string): unknown;
  update(key: string, value: unknown): Thenable<void>;
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

export function normalizeJiraOpsNotificationState(
  value: unknown
): JiraOpsNotificationState {
  if (!isRecord(value)) {
    return emptyNotificationState();
  }

  return {
    baseline: normalizeBaseline(value['baseline']),
    notifications: normalizeNotifications(value['notifications']),
  };
}

export function readJiraOpsNotificationState(
  memento: JiraOpsNotificationMemento
): JiraOpsNotificationState {
  return normalizeJiraOpsNotificationState(
    memento.get(JIRA_OPS_NOTIFICATION_STATE_KEY)
  );
}

export async function writeJiraOpsNotificationState(
  memento: JiraOpsNotificationMemento,
  state: JiraOpsNotificationState
): Promise<JiraOpsNotificationState> {
  const normalized = normalizeJiraOpsNotificationState(state);
  await memento.update(JIRA_OPS_NOTIFICATION_STATE_KEY, normalized);
  return normalized;
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

function normalizeBaseline(value: unknown): IssueUpdateBaseline {
  if (!isRecord(value)) {
    return {};
  }

  const baseline: IssueUpdateBaseline = {};
  for (const [issueKey, updated] of Object.entries(value)) {
    if (issueKey.trim().length > 0 && typeof updated === 'string') {
      baseline[issueKey] = updated;
    }
  }
  return baseline;
}

function normalizeNotifications(value: unknown): JiraOpsNotification[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((notification) => normalizeNotification(notification))
    .filter((notification): notification is JiraOpsNotification => {
      return notification !== null;
    })
    .slice(0, MAX_NOTIFICATION_HISTORY);
}

function normalizeNotification(value: unknown): JiraOpsNotification | null {
  if (!isRecord(value)) {
    return null;
  }

  const { detail, id, issueKey, title, unread, updated } = value;
  if (
    !isNonEmptyString(detail) ||
    !isNonEmptyString(id) ||
    !isNonEmptyString(issueKey) ||
    !isNonEmptyString(title) ||
    !isNonEmptyString(updated) ||
    typeof unread !== 'boolean'
  ) {
    return null;
  }

  return { detail, id, issueKey, title, unread, updated };
}

function emptyNotificationState(): JiraOpsNotificationState {
  return {
    baseline: {},
    notifications: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
