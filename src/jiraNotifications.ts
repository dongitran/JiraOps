import type {
  JiraAssignedIssue,
  JiraIssueChangelogEntry,
  JiraIssueChangelogItem,
} from './jiraClient';

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

export function seedAssignedIssueNotificationHistory(options: {
  readonly existingNotifications: readonly JiraOpsNotification[];
  readonly issues: readonly JiraAssignedIssue[];
}): readonly JiraOpsNotification[] {
  const knownNotificationIds = new Set(
    options.existingNotifications.map((notification) => notification.id)
  );
  const seededNotifications = options.issues
    .map(createAssignedIssueHistoryNotification)
    .filter((notification) => !knownNotificationIds.has(notification.id));
  return [...seededNotifications, ...options.existingNotifications].slice(
    0,
    MAX_NOTIFICATION_HISTORY
  );
}

export async function rebuildAssignedIssueNotificationHistory(options: {
  readonly fetchIssueChangelog?: (
    issueKey: string
  ) => Promise<JiraIssueChangelogEntry | null>;
  readonly issues: readonly JiraAssignedIssue[];
}): Promise<readonly JiraOpsNotification[]> {
  const issues = [...options.issues]
    .sort(compareAssignedIssuesByUpdatedDesc)
    .slice(0, MAX_NOTIFICATION_HISTORY);
  const notifications = await Promise.all(
    issues.map(async (issue) => {
      const changelog = await resolveIssueChangelog(
        issue.key,
        options.fetchIssueChangelog
      );
      return {
        ...createIssueNotification(issue, 'updated', changelog),
        unread: false,
      };
    })
  );
  return notifications;
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

async function resolveIssueChangelog(
  issueKey: string,
  fetchIssueChangelog:
    | ((issueKey: string) => Promise<JiraIssueChangelogEntry | null>)
    | undefined
): Promise<JiraIssueChangelogEntry | null> {
  if (fetchIssueChangelog === undefined) {
    return null;
  }

  try {
    return await fetchIssueChangelog(issueKey);
  } catch {
    return null;
  }
}

function compareAssignedIssuesByUpdatedDesc(
  left: JiraAssignedIssue,
  right: JiraAssignedIssue
): number {
  return compareUpdatedDesc(left.updated, right.updated);
}

function compareUpdatedDesc(leftValue: string, rightValue: string): number {
  const leftTime = Date.parse(leftValue);
  const rightTime = Date.parse(rightValue);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return rightValue.localeCompare(leftValue);
  }
  return rightTime - leftTime;
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

export function createIssueNotification(
  issue: JiraAssignedIssue,
  reason: 'assigned' | 'updated',
  changelog: JiraIssueChangelogEntry | null = null
): JiraOpsNotification {
  const issueType = normalizeIssueType(issue);
  const copy = createNotificationCopy(issue, issueType, reason, changelog);
  return {
    detail: copy.detail,
    id: `${issue.key}:${issue.updated}`,
    issueKey: issue.key,
    title: copy.title,
    unread: true,
    updated: issue.updated,
  };
}

export function enrichIssueUpdateNotification(
  notification: JiraOpsNotification,
  issue: JiraAssignedIssue,
  changelog: JiraIssueChangelogEntry | null
): JiraOpsNotification {
  return {
    ...createIssueNotification(issue, 'updated', changelog),
    unread: notification.unread,
  };
}

export function describeChangelogAction(
  items: readonly JiraIssueChangelogItem[]
): string {
  if (hasChangelogField(items, ['WorklogId', 'timespent'])) {
    return 'Logged work';
  }

  const status = findChangelogItem(items, 'status');
  if (status !== null) {
    return describeTargetAction('Changed status to', status, 'Changed status');
  }

  const assignee = findChangelogItem(items, 'assignee');
  if (assignee !== null) {
    return describeTargetAction('Reassigned to', assignee, 'Reassigned');
  }

  if (findChangelogItem(items, 'Attachment') !== null) {
    return 'Added an attachment';
  }
  if (findChangelogItem(items, 'comment') !== null) {
    return 'Added a comment';
  }
  if (findChangelogItem(items, 'summary') !== null) {
    return 'Updated the title';
  }
  if (findChangelogItem(items, 'description') !== null) {
    return 'Updated the description';
  }

  const priority = findChangelogItem(items, 'priority');
  if (priority !== null) {
    return describeTargetAction('Changed priority to', priority, 'Changed priority');
  }

  if (findChangelogItem(items, 'resolution') !== null) {
    return 'Resolved the issue';
  }
  return 'Made changes';
}

function createAssignedIssueHistoryNotification(
  issue: JiraAssignedIssue
): JiraOpsNotification {
  const issueType = normalizeIssueType(issue);
  return {
    detail: issue.summary,
    id: `${issue.key}:${issue.updated}`,
    issueKey: issue.key,
    title: `${issue.key} ${issueType} assigned issue activity`,
    unread: false,
    updated: issue.updated,
  };
}

function createNotificationCopy(
  issue: JiraAssignedIssue,
  issueType: string,
  reason: 'assigned' | 'updated',
  changelog: JiraIssueChangelogEntry | null
): { readonly detail: string; readonly title: string } {
  if (reason === 'assigned') {
    return {
      detail: issue.summary,
      title: `New ${issueType} assigned: ${issue.key}`,
    };
  }

  if (changelog !== null) {
    return {
      detail: `${describeChangelogAction(changelog.items)} · ${issue.summary}`,
      title: `${changelog.authorDisplayName} updated ${issueType} ${issue.key}`,
    };
  }

  return {
    detail: issue.summary,
    title: `${issue.key} ${issueType} was updated`,
  };
}

function normalizeIssueType(issue: JiraAssignedIssue): string {
  return typeof issue.issueType === 'string' && issue.issueType.trim().length > 0
    ? issue.issueType.trim()
    : 'Issue';
}

function hasChangelogField(
  items: readonly JiraIssueChangelogItem[],
  fields: readonly string[]
): boolean {
  return fields.some((field) => findChangelogItem(items, field) !== null);
}

function findChangelogItem(
  items: readonly JiraIssueChangelogItem[],
  field: string
): JiraIssueChangelogItem | null {
  const normalizedField = field.toLowerCase();
  return (
    items.find((item) => item.field.trim().toLowerCase() === normalizedField) ?? null
  );
}

function describeTargetAction(
  prefix: string,
  item: JiraIssueChangelogItem,
  fallback: string
): string {
  const target = item.toString?.trim() ?? '';
  return target.length > 0 ? `${prefix} ${target}` : fallback;
}

function isNewerTimestamp(nextValue: string, previousValue: string): boolean {
  const nextTime = Date.parse(nextValue);
  const previousTime = Date.parse(previousValue);
  if (Number.isNaN(nextTime) || Number.isNaN(previousTime)) {
    return nextValue !== previousValue;
  }

  return nextTime > previousTime;
}
