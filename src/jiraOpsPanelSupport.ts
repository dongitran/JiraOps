import * as vscode from 'vscode';

import {
  JiraCredentialSetupCanceledError,
  type JiraCredentialInputOptions,
} from './jiraCredentials';
import type {
  JiraAssignedIssue,
  JiraConnectionStatus,
} from './jiraClient';
import type { DashboardIssue } from './dashboardItems';
import type { JiraIssueDetail } from './jiraIssueDetails';
import { notificationPollIntervalMs, type JiraOpsSettings } from './jiraOpsSettings';
import type { RemoteWebLink } from './remoteLinks';
import {
  isJiraOpsTestMode,
  resolveTestIssueDetail,
  resolveTestRemoteLinks,
} from './testModeData';

const TEST_JIRA_CLOUD_NAME = 'Example Jira';

export type { JiraCredentialInputOptions };

export class JiraConnectionRequiredError extends Error {}

export function testRemoteLinksLoader(issueKey: string): Promise<RemoteWebLink[]> {
  return Promise.resolve(resolveTestRemoteLinks(issueKey));
}

export function testIssueDetailLoader(issueKey: string): Promise<JiraIssueDetail> {
  return Promise.resolve(resolveTestIssueDetail(issueKey));
}

export function toAssignedIssue(issue: DashboardIssue): JiraAssignedIssue {
  return {
    assigneeDisplayName: null,
    issueType: 'Issue',
    key: issue.key,
    priority: issue.priority === 'No priority' ? null : issue.priority,
    status: issue.status,
    statusCategory: issue.statusCategory,
    summary: issue.summary,
    updated: issue.updated,
    timeSpentSeconds: issue.timeSpentSeconds,
  };
}

export async function waitForConfiguredDetailDelay(): Promise<void> {
  if (!isJiraOpsTestMode()) {
    return;
  }

  const delayMs = parseNonNegativeInteger(
    process.env['JIRA_OPS_DETAIL_TEST_DELAY_MS']
  );
  if (delayMs === 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function buildCsp(webview: vscode.Webview, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
  ].join('; ');
}

export function buildJiraOpsPanelHtml(
  webview: vscode.Webview,
  nonce: string,
  assetsRoot: vscode.Uri
): string {
  const scriptSrc = webview
    .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'jira-ops.js'))
    .toString();
  const cssSrc = webview
    .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'jira-ops.css'))
    .toString();
  const csp = buildCsp(webview, nonce);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>JiraOps</title>
    <link rel="stylesheet" href="${cssSrc}" />
  </head>
  <body class="jira-ops-page jira-ops-extension">
    <main id="app"></main>
    <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
  </body>
</html>`;
}

export function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 24; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    nonce += alphabet[randomIndex] ?? 'A';
  }
  return nonce;
}

export function testConnectionStatus(connected: boolean): JiraConnectionStatus {
  return {
    cloudName: connected ? TEST_JIRA_CLOUD_NAME : null,
    connected,
  };
}

export function initialConnectionMessage(status: JiraConnectionStatus): string {
  return status.connected ? '' : 'Connect Jira to load assigned tickets.';
}

export function connectionErrorMessage(error: unknown): string {
  if (error instanceof JiraCredentialSetupCanceledError) {
    return error.message;
  }

  if (error instanceof Error && isJiraCredentialSetupMessage(error.message)) {
    return error.message;
  }

  return 'Jira connection could not be completed.';
}

export function dashboardLoadedLogMessage(
  issues: readonly DashboardIssue[]
): string {
  return `Loaded ${String(issues.length)} assigned Jira tickets.`;
}

export function resolveNotificationPollIntervalMs(settings: JiraOpsSettings): number {
  if (!isJiraOpsTestMode()) {
    return notificationPollIntervalMs(settings);
  }

  const override = parsePositiveInteger(
    process.env['JIRA_OPS_NOTIFICATION_POLL_INTERVAL_MS']
  );
  return override ?? notificationPollIntervalMs(settings);
}

export function webLinkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown host';
  }
}

function parseNonNegativeInteger(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    return 0;
  }

  return Number(value);
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

function isJiraCredentialSetupMessage(message: string): boolean {
  return message.startsWith('Jira OAuth client ');
}
