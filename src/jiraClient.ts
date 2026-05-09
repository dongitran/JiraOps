import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { parseRemoteLinksResponse, type RemoteWebLink } from './remoteLinks';

export {
  buildJiraIssueCommentsUrl,
  buildNotificationIssuesSearchBody,
  fetchJiraIssueActivityEntries,
  fetchJiraIssueRecentComments,
  fetchNotificationJiraIssues,
  type FetchJiraIssueActivityOptions,
  type FetchNotificationJiraIssuesOptions,
  type JiraIssueActivityEntry,
  type JiraIssueCommentEntry,
  type NotificationIssuesSearchBody,
} from './jiraNotificationClient';

export interface JiraTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly scope: string;
  readonly tokenType: string;
  readonly cloudId: string;
  readonly cloudName: string;
  readonly issuedAt: number;
}

export interface FetchJiraRemoteLinksOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly issueKey: string;
  readonly fetchImpl?: typeof fetch;
}

export interface FetchAssignedJiraIssuesOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly maxResults?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface FetchJiraIssueTransitionsOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly issueKey: string;
  readonly fetchImpl?: typeof fetch;
}

export interface FetchJiraIssueLatestChangelogOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly issueKey: string;
  readonly fetchImpl?: typeof fetch;
}

export interface TransitionJiraIssueOptions extends FetchJiraIssueTransitionsOptions {
  readonly transitionId: string;
}

export interface AddJiraIssueWorklogOptions extends FetchJiraIssueTransitionsOptions {
  readonly comment?: string;
  readonly minutes: number;
  readonly started?: string;
}

export interface AssignedIssuesSearchBody {
  readonly jql: string;
  readonly fields: readonly string[];
  readonly maxResults: number;
}

export interface JiraAssignedIssue {
  readonly key: string;
  readonly issueType: string;
  readonly summary: string;
  readonly status: string;
  readonly statusCategory: string;
  readonly priority: string | null;
  readonly assigneeDisplayName: string | null;
  readonly updated: string;
}

export interface JiraIssueChangelogItem {
  readonly field: string;
  readonly fromString: string | null;
  readonly toString: string | null;
}

export interface JiraIssueChangelogEntry {
  readonly authorDisplayName: string;
  readonly created: string;
  readonly items: readonly JiraIssueChangelogItem[];
}

export interface JiraIssueTransition {
  readonly id: string;
  readonly name: string;
  readonly toStatus: string;
}

export interface JiraTokenProvider {
  getTokens(): Promise<JiraTokens>;
  getStoredOrRefreshTokens(): Promise<JiraTokens | null>;
  getConnectionStatus(): Promise<JiraConnectionStatus>;
  connect(): Promise<JiraConnectionStatus>;
  disconnect(): Promise<JiraConnectionStatus>;
}

export interface JiraConnectionStatus {
  readonly connected: boolean;
  readonly cloudName: string | null;
}

export interface JiraOAuthClientLike {
  getStoredTokens(): JiraTokens | null;
  refresh(refreshToken: string): Promise<JiraTokens>;
  authenticate(): Promise<JiraTokens>;
  clearStoredTokens?: () => Promise<void> | void;
}

export type JiraOAuthClientFactory = () => JiraOAuthClientLike | Promise<JiraOAuthClientLike>;

const ATLASSIAN_API_ROOT = 'https://api.atlassian.com/ex/jira';
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60_000;
const DEFAULT_TOKEN_STORE_PATH = join(homedir(), '.jira-oauth', 'tokens.json');
const ASSIGNED_ISSUES_JQL =
  'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';
const ASSIGNED_ISSUE_FIELDS = [
  'summary',
  'status',
  'priority',
  'assignee',
  'updated',
  'issuetype',
] as const;
const DEFAULT_ASSIGNED_ISSUE_LIMIT = 25;

const JiraAssignedIssueSchema = z.object({
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

const JiraAssignedIssuesResponseSchema = z.object({
  issues: z.array(JiraAssignedIssueSchema),
});

const JiraIssueTransitionsResponseSchema = z.object({
  transitions: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      to: z
        .object({
          name: z.string().min(1),
        })
        .optional(),
    })
  ),
});

const JiraIssueChangelogItemSchema = z.object({
  field: z.string().min(1),
  fromString: z.string().nullable().optional(),
  toString: z.string().nullable().optional(),
});

const JiraIssueChangelogHistorySchema = z.object({
  author: z.object({
    displayName: z.string().min(1),
  }),
  created: z.string().min(1),
  items: z.array(JiraIssueChangelogItemSchema),
});

const JiraIssueLatestChangelogResponseSchema = z.object({
  changelog: z.object({
    histories: z.array(JiraIssueChangelogHistorySchema),
  }),
});

type JiraIssueChangelogHistoryResponse = z.infer<
  typeof JiraIssueChangelogHistorySchema
>;

export class OAuthJiraTokenProvider implements JiraTokenProvider {
  private resolvedClient: JiraOAuthClientLike | null = null;

  public constructor(
    private readonly clientOrFactory: JiraOAuthClientLike | JiraOAuthClientFactory =
      createDefaultJiraOAuthClient
  ) {}

  public async getTokens(): Promise<JiraTokens> {
    const client = await this.getClient();
    const storedTokens = client.getStoredTokens();
    if (storedTokens !== null && isTokenUsable(storedTokens)) {
      return storedTokens;
    }

    if (storedTokens !== null && storedTokens.refreshToken.length > 0) {
      return client.refresh(storedTokens.refreshToken);
    }

    return client.authenticate();
  }

  public async getStoredOrRefreshTokens(): Promise<JiraTokens | null> {
    const client = await this.getClient();
    const storedTokens = client.getStoredTokens();
    if (storedTokens === null) {
      return null;
    }

    if (isTokenUsable(storedTokens)) {
      return storedTokens;
    }

    if (storedTokens.refreshToken.length === 0) {
      return null;
    }

    return client.refresh(storedTokens.refreshToken);
  }

  public async getConnectionStatus(): Promise<JiraConnectionStatus> {
    try {
      const client = await this.getClient();
      const storedTokens = client.getStoredTokens();
      return storedTokens === null
        ? disconnectedJiraStatus()
        : connectedJiraStatus(storedTokens);
    } catch {
      return disconnectedJiraStatus();
    }
  }

  public async connect(): Promise<JiraConnectionStatus> {
    const tokens = await this.getTokens();
    return connectedJiraStatus(tokens);
  }

  public async disconnect(): Promise<JiraConnectionStatus> {
    const client = await this.getClientIfAvailable();
    if (client !== null && isClearableJiraOAuthClient(client)) {
      await client.clearStoredTokens();
      return disconnectedJiraStatus();
    }

    await clearDefaultTokenStore();
    return disconnectedJiraStatus();
  }

  private async getClient(): Promise<JiraOAuthClientLike> {
    if (this.resolvedClient !== null) {
      return this.resolvedClient;
    }

    const client = isJiraOAuthClientLike(this.clientOrFactory)
      ? this.clientOrFactory
      : await this.clientOrFactory();
    this.resolvedClient = client;
    return client;
  }

  private async getClientIfAvailable(): Promise<JiraOAuthClientLike | null> {
    try {
      return await this.getClient();
    } catch {
      return null;
    }
  }
}

export function isTokenUsable(tokens: JiraTokens, nowMs = Date.now()): boolean {
  const expiresAtMs = tokens.issuedAt + tokens.expiresIn * 1000;
  return expiresAtMs - TOKEN_REFRESH_SAFETY_WINDOW_MS > nowMs;
}

export function buildJiraRemoteLinksUrl(cloudId: string, issueKey: string): string {
  const encodedCloudId = encodeURIComponent(cloudId);
  const encodedIssueKey = encodeURIComponent(issueKey);
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/issue/${encodedIssueKey}/remotelink`;
}

export function buildAssignedIssuesSearchUrl(cloudId: string): string {
  const encodedCloudId = encodeURIComponent(cloudId);
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/search/jql`;
}

export function buildJiraIssueTransitionsUrl(
  cloudId: string,
  issueKey: string
): string {
  return `${buildJiraIssueUrl(cloudId, issueKey)}/transitions`;
}

export function buildJiraIssueLatestChangelogUrl(
  cloudId: string,
  issueKey: string
): string {
  return `${buildJiraIssueUrl(cloudId, issueKey)}?fields=summary&expand=changelog`;
}

export function buildJiraIssueWorklogUrl(cloudId: string, issueKey: string): string {
  return `${buildJiraIssueUrl(cloudId, issueKey)}/worklog`;
}

export function buildAssignedIssuesSearchBody(
  maxResults = DEFAULT_ASSIGNED_ISSUE_LIMIT
): AssignedIssuesSearchBody {
  return {
    jql: ASSIGNED_ISSUES_JQL,
    fields: [...ASSIGNED_ISSUE_FIELDS],
    maxResults,
  };
}

export async function fetchJiraRemoteLinks(
  options: FetchJiraRemoteLinksOptions
): Promise<RemoteWebLink[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildJiraRemoteLinksUrl(options.cloudId, options.issueKey),
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Jira remote links could not be loaded.');
  }

  const responseBody: unknown = await response.json();
  return parseRemoteLinksResponse(responseBody);
}

export async function fetchAssignedJiraIssues(
  options: FetchAssignedJiraIssuesOptions
): Promise<JiraAssignedIssue[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = buildAssignedIssuesSearchBody(options.maxResults);
  const response = await fetchImpl(buildAssignedIssuesSearchUrl(options.cloudId), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Assigned Jira issues could not be loaded.');
  }

  const responseBody: unknown = await response.json();
  return parseAssignedIssuesResponse(responseBody);
}

export async function fetchJiraIssueLatestChangelog(
  options: FetchJiraIssueLatestChangelogOptions
): Promise<JiraIssueChangelogEntry | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(
      buildJiraIssueLatestChangelogUrl(options.cloudId, options.issueKey),
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${options.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const responseBody: unknown = await response.json();
    return parseLatestChangelogResponse(responseBody);
  } catch {
    return null;
  }
}

export async function fetchJiraIssueTransitions(
  options: FetchJiraIssueTransitionsOptions
): Promise<JiraIssueTransition[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildJiraIssueTransitionsUrl(options.cloudId, options.issueKey),
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Jira issue transitions could not be loaded.');
  }

  const responseBody: unknown = await response.json();
  return parseIssueTransitionsResponse(responseBody);
}

export async function transitionJiraIssue(
  options: TransitionJiraIssueOptions
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildJiraIssueTransitionsUrl(options.cloudId, options.issueKey),
    {
      method: 'POST',
      headers: jsonJiraHeaders(options.accessToken),
      body: JSON.stringify({ transition: { id: options.transitionId } }),
    }
  );

  if (!response.ok) {
    throw new Error('Jira issue status could not be changed.');
  }
}

export async function addJiraIssueWorklog(
  options: AddJiraIssueWorklogOptions
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildJiraIssueWorklogUrl(options.cloudId, options.issueKey), {
    method: 'POST',
    headers: jsonJiraHeaders(options.accessToken),
    body: JSON.stringify(buildWorklogRequestBody(options)),
  });

  if (!response.ok) {
    throw new Error('Jira work log could not be added.');
  }
}

function parseAssignedIssuesResponse(responseBody: unknown): JiraAssignedIssue[] {
  const parseResult = JiraAssignedIssuesResponseSchema.safeParse(responseBody);
  if (!parseResult.success) {
    throw new Error('Assigned Jira issue response was not valid.');
  }

  return parseResult.data.issues.map((issue) => {
    return {
      key: issue.key,
      issueType: issue.fields.issuetype.name,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      statusCategory: issue.fields.status.statusCategory.name,
      priority: issue.fields.priority?.name ?? null,
      assigneeDisplayName: issue.fields.assignee?.displayName ?? null,
      updated: issue.fields.updated,
    };
  });
}

function parseLatestChangelogResponse(
  responseBody: unknown
): JiraIssueChangelogEntry | null {
  const parseResult = JiraIssueLatestChangelogResponseSchema.safeParse(responseBody);
  if (!parseResult.success) {
    return null;
  }

  const latestHistory = pickLatestChangelogHistory(
    parseResult.data.changelog.histories
  );
  return latestHistory === null ? null : mapChangelogHistory(latestHistory);
}

function pickLatestChangelogHistory(
  histories: readonly JiraIssueChangelogHistoryResponse[]
): JiraIssueChangelogHistoryResponse | null {
  let selected = histories[0] ?? null;
  let selectedTime = selected === null ? null : parseTimestamp(selected.created);
  for (const history of histories.slice(1)) {
    const time = parseTimestamp(history.created);
    if (time === null) {
      continue;
    }
    if (selectedTime === null || time > selectedTime) {
      selected = history;
      selectedTime = time;
    }
  }
  return selected;
}

function mapChangelogHistory(
  history: JiraIssueChangelogHistoryResponse
): JiraIssueChangelogEntry {
  return {
    authorDisplayName: history.author.displayName,
    created: history.created,
    items: history.items.map((item) => ({
      field: item.field,
      fromString: item.fromString ?? null,
      toString: item.toString ?? null,
    })),
  };
}

function parseTimestamp(value: string): number | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function parseIssueTransitionsResponse(responseBody: unknown): JiraIssueTransition[] {
  const parseResult = JiraIssueTransitionsResponseSchema.safeParse(responseBody);
  if (!parseResult.success) {
    throw new Error('Jira issue transitions response was not valid.');
  }

  return parseResult.data.transitions.map((transition) => {
    return {
      id: transition.id,
      name: transition.name,
      toStatus: transition.to?.name ?? transition.name,
    };
  });
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

function buildWorklogRequestBody(
  options: AddJiraIssueWorklogOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    started: options.started ?? formatJiraDate(new Date()),
    timeSpentSeconds: options.minutes * 60,
  };
  const comment = options.comment?.trim() ?? '';
  if (comment.length > 0) {
    body['comment'] = textToAdfDocument(comment);
  }
  return body;
}

function textToAdfDocument(text: string): Record<string, unknown> {
  return {
    content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }],
    type: 'doc',
    version: 1,
  };
}

function formatJiraDate(date: Date): string {
  return date.toISOString().replace('Z', '+0000');
}

async function createDefaultJiraOAuthClient(): Promise<JiraOAuthClientLike> {
  const module: unknown = await import('jira-oauth-client');
  if (!isJiraOAuthClientModule(module)) {
    throw new Error('Jira OAuth client could not be loaded.');
  }

  return new module.JiraOAuthClient();
}

function isJiraOAuthClientModule(
  value: unknown
): value is { readonly JiraOAuthClient: new () => JiraOAuthClientLike } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return typeof (value as Record<string, unknown>)['JiraOAuthClient'] === 'function';
}

function isJiraOAuthClientLike(value: unknown): value is JiraOAuthClientLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['getStoredTokens'] === 'function' &&
    typeof candidate['refresh'] === 'function' &&
    typeof candidate['authenticate'] === 'function'
  );
}

function connectedJiraStatus(tokens: JiraTokens): JiraConnectionStatus {
  return {
    connected: true,
    cloudName: tokens.cloudName,
  };
}

function disconnectedJiraStatus(): JiraConnectionStatus {
  return {
    connected: false,
    cloudName: null,
  };
}

function isClearableJiraOAuthClient(
  value: JiraOAuthClientLike
): value is JiraOAuthClientLike & { clearStoredTokens: () => Promise<void> | void } {
  return typeof value.clearStoredTokens === 'function';
}

async function clearDefaultTokenStore(): Promise<void> {
  await rm(DEFAULT_TOKEN_STORE_PATH, { force: true });
}
