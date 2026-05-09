import { z } from 'zod';

import type { JiraAssignedIssue, JiraIssueChangelogItem } from './jiraClient';

export interface FetchNotificationJiraIssuesOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly maxResults?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface FetchJiraIssueActivityOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly issueKey: string;
  readonly fetchImpl?: typeof fetch;
}

export interface JiraIssueCommentEntry {
  readonly authorDisplayName: string;
  readonly created: string;
  readonly id: string;
  readonly updated: string;
}

export type JiraIssueActivityEntry =
  | {
      readonly authorDisplayName: string;
      readonly created: string;
      readonly id: string;
      readonly items: readonly JiraIssueChangelogItem[];
      readonly type: 'changelog';
    }
  | {
      readonly authorDisplayName: string;
      readonly created: string;
      readonly id: string;
      readonly type: 'comment';
      readonly updated: string;
    };

export interface NotificationIssuesSearchBody {
  readonly jql: string;
  readonly fields: readonly string[];
  readonly maxResults: number;
}

interface JiraChangelogHistoryEntry {
  readonly authorDisplayName: string;
  readonly created: string;
  readonly id: string;
  readonly items: readonly JiraIssueChangelogItem[];
}

const ATLASSIAN_API_ROOT = 'https://api.atlassian.com/ex/jira';
const DEFAULT_NOTIFICATION_ISSUE_LIMIT = 30;
const DEFAULT_COMMENT_LIMIT = 5;
const NOTIFICATION_ISSUES_JQL =
  'updated >= -30d AND (assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser()) ORDER BY updated DESC';
const NOTIFICATION_ISSUE_FIELDS = [
  'summary',
  'status',
  'priority',
  'assignee',
  'updated',
  'issuetype',
] as const;

const JiraNotificationIssueSchema = z.object({
  key: z.string().min(1),
  fields: z.object({
    summary: z.string().min(1),
    status: z.object({
      name: z.string().min(1),
      statusCategory: z.object({
        name: z.string().min(1),
      }),
    }),
    priority: z
      .object({
        name: z.string().min(1),
      })
      .nullable()
      .optional(),
    assignee: z
      .object({
        displayName: z.string().min(1),
      })
      .nullable()
      .optional(),
    issuetype: z.object({
      name: z.string().min(1),
    }),
    updated: z.string().min(1),
  }),
});

const JiraNotificationIssuesResponseSchema = z.object({
  issues: z.array(JiraNotificationIssueSchema),
});

const JiraActivityChangelogItemSchema = z.object({
  field: z.string().min(1),
  fromString: z.string().nullable().optional(),
  toString: z.string().nullable().optional(),
});

const JiraActivityChangelogHistorySchema = z.object({
  author: z.object({
    displayName: z.string().min(1),
  }),
  created: z.string().min(1),
  id: z.string().min(1).optional(),
  items: z.array(JiraActivityChangelogItemSchema),
});

const JiraActivityChangelogResponseSchema = z.object({
  changelog: z.object({
    histories: z.array(JiraActivityChangelogHistorySchema),
  }),
});

const JiraCommentSchema = z.object({
  author: z.object({
    displayName: z.string().min(1),
  }),
  created: z.string().min(1),
  id: z.string().min(1),
  updated: z.string().min(1).optional(),
});

const JiraCommentsResponseSchema = z.object({
  comments: z.array(JiraCommentSchema),
});

export function buildNotificationIssuesSearchBody(
  maxResults = DEFAULT_NOTIFICATION_ISSUE_LIMIT
): NotificationIssuesSearchBody {
  return {
    fields: [...NOTIFICATION_ISSUE_FIELDS],
    jql: NOTIFICATION_ISSUES_JQL,
    maxResults,
  };
}

export function buildJiraIssueCommentsUrl(
  cloudId: string,
  issueKey: string,
  maxResults = DEFAULT_COMMENT_LIMIT
): string {
  return `${buildJiraIssueUrl(cloudId, issueKey)}/comment?maxResults=${String(maxResults)}&orderBy=-created`;
}

export async function fetchNotificationJiraIssues(
  options: FetchNotificationJiraIssuesOptions
): Promise<JiraAssignedIssue[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = buildNotificationIssuesSearchBody(options.maxResults);
  const response = await fetchImpl(buildSearchUrl(options.cloudId), {
    method: 'POST',
    headers: jsonJiraHeaders(options.accessToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Jira notification issues could not be loaded.');
  }

  const responseBody: unknown = await response.json();
  return parseNotificationIssuesResponse(responseBody);
}

export async function fetchJiraIssueRecentComments(
  options: FetchJiraIssueActivityOptions
): Promise<readonly JiraIssueCommentEntry[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(
      buildJiraIssueCommentsUrl(options.cloudId, options.issueKey),
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${options.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const responseBody: unknown = await response.json();
    return parseCommentsResponse(responseBody);
  } catch {
    return [];
  }
}

export async function fetchJiraIssueActivityEntries(
  options: FetchJiraIssueActivityOptions
): Promise<readonly JiraIssueActivityEntry[]> {
  const [changelogEntries, comments] = await Promise.all([
    fetchJiraIssueRecentChangelogEntries(options),
    fetchJiraIssueRecentComments(options),
  ]);
  return [
    ...changelogEntries.map((entry): JiraIssueActivityEntry => ({
      authorDisplayName: entry.authorDisplayName,
      created: entry.created,
      id: entry.id,
      items: entry.items,
      type: 'changelog',
    })),
    ...comments.map((comment): JiraIssueActivityEntry => ({
      authorDisplayName: comment.authorDisplayName,
      created: comment.created,
      id: comment.id,
      type: 'comment',
      updated: comment.updated,
    })),
  ].sort(compareActivityDesc);
}

async function fetchJiraIssueRecentChangelogEntries(
  options: FetchJiraIssueActivityOptions
): Promise<readonly JiraChangelogHistoryEntry[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(buildJiraIssueChangelogUrl(options.cloudId, options.issueKey), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const responseBody: unknown = await response.json();
    return parseChangelogResponse(responseBody);
  } catch {
    return [];
  }
}

function parseNotificationIssuesResponse(responseBody: unknown): JiraAssignedIssue[] {
  const parseResult = JiraNotificationIssuesResponseSchema.safeParse(responseBody);
  if (!parseResult.success) {
    throw new Error('Jira notification issue response was not valid.');
  }

  return parseResult.data.issues.map((issue) => ({
    assigneeDisplayName: issue.fields.assignee?.displayName ?? null,
    issueType: issue.fields.issuetype.name,
    key: issue.key,
    priority: issue.fields.priority?.name ?? null,
    status: issue.fields.status.name,
    statusCategory: issue.fields.status.statusCategory.name,
    summary: issue.fields.summary,
    updated: issue.fields.updated,
  }));
}

function parseChangelogResponse(
  responseBody: unknown
): readonly JiraChangelogHistoryEntry[] {
  const parseResult = JiraActivityChangelogResponseSchema.safeParse(responseBody);
  if (!parseResult.success) {
    return [];
  }

  return parseResult.data.changelog.histories.map((history) => ({
    authorDisplayName: history.author.displayName,
    created: history.created,
    id: history.id ?? history.created,
    items: history.items.map((item) => ({
      field: item.field,
      fromString: item.fromString ?? null,
      toString: item.toString ?? null,
    })),
  }));
}

function parseCommentsResponse(
  responseBody: unknown
): readonly JiraIssueCommentEntry[] {
  const parseResult = JiraCommentsResponseSchema.safeParse(responseBody);
  if (!parseResult.success) {
    return [];
  }

  return parseResult.data.comments
    .map((comment) => ({
      authorDisplayName: comment.author.displayName,
      created: comment.created,
      id: comment.id,
      updated: comment.updated ?? comment.created,
    }))
    .sort((left, right) => compareTimestampDesc(left.updated, right.updated));
}

function compareActivityDesc(
  left: JiraIssueActivityEntry,
  right: JiraIssueActivityEntry
): number {
  return compareTimestampDesc(activityTimestamp(left), activityTimestamp(right));
}

function compareTimestampDesc(leftValue: string, rightValue: string): number {
  const leftTime = Date.parse(leftValue);
  const rightTime = Date.parse(rightValue);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return rightValue.localeCompare(leftValue);
  }
  return rightTime - leftTime;
}

function activityTimestamp(activity: JiraIssueActivityEntry): string {
  return activity.type === 'comment' ? activity.updated : activity.created;
}

function buildSearchUrl(cloudId: string): string {
  const encodedCloudId = encodeURIComponent(cloudId);
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/search/jql`;
}

function buildJiraIssueChangelogUrl(cloudId: string, issueKey: string): string {
  return `${buildJiraIssueUrl(cloudId, issueKey)}?fields=summary&expand=changelog`;
}

function buildJiraIssueUrl(cloudId: string, issueKey: string): string {
  const encodedCloudId = encodeURIComponent(cloudId);
  const encodedIssueKey = encodeURIComponent(issueKey);
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/issue/${encodedIssueKey}`;
}

function jsonJiraHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}
