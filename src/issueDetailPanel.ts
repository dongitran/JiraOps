import * as vscode from 'vscode';

import type { DashboardIssue } from './dashboardItems';
import { isOpenExternalLinkMessage } from './webviewMessages';

const WEBVIEW_ASSET_PATH = ['docs', 'designs', 'prototypes', 'assets'] as const;

export interface ShowIssueDetailPanelOptions {
  readonly extensionUri: vscode.Uri;
  readonly outputChannel: vscode.OutputChannel;
  readonly issue: DashboardIssue;
}

export function showIssueDetailPanel(options: ShowIssueDetailPanelOptions): void {
  const assetsRoot = vscode.Uri.joinPath(options.extensionUri, ...WEBVIEW_ASSET_PATH);
  const panel = vscode.window.createWebviewPanel(
    'jiraOps.issueDetail',
    `${options.issue.key} Details`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      localResourceRoots: [assetsRoot],
      retainContextWhenHidden: true,
    }
  );
  const nonce = createNonce();
  panel.webview.html = buildIssueDetailHtml(panel.webview, assetsRoot, nonce, options.issue);
  const subscription = panel.webview.onDidReceiveMessage((message: unknown) => {
    void handleDetailMessage(message, options.outputChannel);
  });
  panel.onDidDispose(() => {
    subscription.dispose();
  });
}

async function handleDetailMessage(
  message: unknown,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  if (!isOpenExternalLinkMessage(message)) {
    return;
  }

  outputChannel.appendLine(`Opening Jira issue detail link on ${webLinkHost(message.url)}.`);
  await vscode.env.openExternal(vscode.Uri.parse(message.url));
}

function buildIssueDetailHtml(
  webview: vscode.Webview,
  assetsRoot: vscode.Uri,
  nonce: string,
  issue: DashboardIssue
): string {
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
    <title>${escapeHtml(issue.key)} Details</title>
    <link rel="stylesheet" href="${cssSrc}" />
  </head>
  <body class="jira-ops-page jira-detail-page">
    ${renderIssueDetail(issue)}
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      for (const link of document.querySelectorAll('a[data-url]')) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          vscode.postMessage({ type: 'jiraOps.openExternalLink', url: link.href });
        });
      }
    </script>
  </body>
</html>`;
}

function renderIssueDetail(issue: DashboardIssue): string {
  return `
    <main class="detail-shell" aria-label="${escapeAttribute(issue.key)} details">
      <header class="detail-page-header">
        <div class="detail-page-title">
          <span class="issue-key">${escapeHtml(issue.key)}</span>
          <h1>${escapeHtml(issue.summary)}</h1>
        </div>
        <span class="status-chip" data-category="${escapeAttribute(issue.statusCategory)}">${escapeHtml(issue.status)}</span>
      </header>
      ${renderMergeRequestSection(issue)}
      ${renderWebLinksSection(issue)}
    </main>
  `;
}

function renderMergeRequestSection(issue: DashboardIssue): string {
  const count = issue.mergeRequests.length;
  const content =
    count === 0
      ? '<p class="detail-muted">No GitLab merge requests were found for this issue.</p>'
      : `<div class="detail-grid">${issue.mergeRequests.map(renderMergeRequestLink).join('')}</div>`;

  return renderDetailSection('GitLab merge requests', count, content);
}

function renderWebLinksSection(issue: DashboardIssue): string {
  const count = issue.webLinks.length;
  const content =
    count === 0
      ? '<p class="detail-muted">No Jira remote web links were found for this issue.</p>'
      : `<div class="detail-grid">${issue.webLinks.map(renderWebLink).join('')}</div>`;

  return renderDetailSection('All Jira web links', count, content);
}

function renderMergeRequestLink(link: DashboardIssue['mergeRequests'][number]): string {
  return `
    <a class="detail-link detail-link-primary" href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer" data-url="${escapeAttribute(link.url)}">
      <strong>${escapeHtml(link.title)}</strong>
      <span>${escapeHtml(link.projectPath)} !${escapeHtml(link.iid)}</span>
    </a>
  `;
}

function renderWebLink(link: DashboardIssue['webLinks'][number]): string {
  return `
    <a class="detail-link" href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer" data-url="${escapeAttribute(link.url)}">
      <strong>${escapeHtml(link.title)}</strong>
      <span>${escapeHtml(link.relationship)} - ${escapeHtml(link.host)}</span>
    </a>
  `;
}

function renderDetailSection(title: string, count: number, content: string): string {
  return `
    <section class="detail-section" aria-label="${escapeAttribute(title)}">
      <div class="detail-section-heading">
        <h2>${escapeHtml(title)}</h2>
        <span>${String(count)}</span>
      </div>
      ${content}
    </section>
  `;
}

function buildCsp(webview: vscode.Webview, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 24; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    nonce += alphabet[randomIndex] ?? 'A';
  }
  return nonce;
}

function webLinkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown host';
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
