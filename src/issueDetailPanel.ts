import * as vscode from 'vscode';

import type { DashboardIssue } from './dashboardItems';
import type { JiraIssueAttachment, JiraIssueComment, JiraIssueDetail } from './jiraIssueDetails';
import { isOpenExternalLinkMessage } from './webviewMessages';

const WEBVIEW_ASSET_PATH = ['docs', 'designs', 'prototypes', 'assets'] as const;

export interface ShowIssueDetailPanelOptions {
  readonly extensionUri: vscode.Uri;
  readonly initialDetail?: JiraIssueDetail;
  readonly outputChannel: vscode.OutputChannel;
  readonly issue: DashboardIssue;
}

export interface IssueDetailPanelHandle {
  showLoaded(issue: DashboardIssue, detail: JiraIssueDetail): void;
  showError(message: string): void;
}

interface IssueDetailPanelHandleOptions {
  readonly panel: vscode.WebviewPanel;
  readonly assetsRoot: vscode.Uri;
  readonly nonce: string;
  readonly issue: DashboardIssue;
  readonly isDisposed: () => boolean;
}

export function showIssueDetailPanel(
  options: ShowIssueDetailPanelOptions
): IssueDetailPanelHandle {
  const assetsRoot = vscode.Uri.joinPath(options.extensionUri, ...WEBVIEW_ASSET_PATH);
  const panel = createIssueDetailWebviewPanel(options.issue, assetsRoot);
  const nonce = createNonce();
  let disposed = false;
  panel.webview.html =
    options.initialDetail === undefined
      ? buildIssueDetailLoadingHtml(panel.webview, assetsRoot, nonce, options.issue)
      : buildIssueDetailHtml(
          panel.webview,
          assetsRoot,
          nonce,
          options.issue,
          options.initialDetail
        );
  const subscription = panel.webview.onDidReceiveMessage((message: unknown) => {
    void handleDetailMessage(message, options.outputChannel);
  });
  panel.onDidDispose(() => {
    disposed = true;
    subscription.dispose();
  });

  return createIssueDetailPanelHandle({
    panel,
    assetsRoot,
    nonce,
    issue: options.issue,
    isDisposed: () => disposed,
  });
}

function createIssueDetailWebviewPanel(
  issue: DashboardIssue,
  assetsRoot: vscode.Uri
): vscode.WebviewPanel {
  return vscode.window.createWebviewPanel(
    'jiraOps.issueDetail',
    `${issue.key} Details`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      localResourceRoots: [assetsRoot],
      retainContextWhenHidden: true,
    }
  );
}

function createIssueDetailPanelHandle(
  options: IssueDetailPanelHandleOptions
): IssueDetailPanelHandle {
  return {
    showLoaded(issue: DashboardIssue, detail: JiraIssueDetail): void {
      if (options.isDisposed()) {
        return;
      }

      options.panel.webview.html = buildIssueDetailHtml(
        options.panel.webview,
        options.assetsRoot,
        options.nonce,
        issue,
        detail
      );
    },
    showError(message: string): void {
      if (options.isDisposed()) {
        return;
      }

      options.panel.webview.html = buildIssueDetailErrorHtml(
        options.panel.webview,
        options.assetsRoot,
        options.nonce,
        options.issue,
        message
      );
    },
  };
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
  issue: DashboardIssue,
  detail: JiraIssueDetail
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
    ${renderIssueDetail(issue, detail)}
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      for (const link of document.querySelectorAll('a[href]')) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          vscode.postMessage({ type: 'jiraOps.openExternalLink', url: link.href });
        });
      }
    </script>
  </body>
</html>`;
}

function buildIssueDetailLoadingHtml(
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
  <body class="jira-ops-page jira-detail-loading-page">
    ${renderIssueDetailLoading(issue)}
  </body>
</html>`;
}

function buildIssueDetailErrorHtml(
  webview: vscode.Webview,
  assetsRoot: vscode.Uri,
  nonce: string,
  issue: DashboardIssue,
  message: string
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
  <body class="jira-ops-page jira-detail-loading-page">
    <main class="detail-loading-indicator" role="alert" aria-label="${escapeAttribute(issue.key)} details">
      <strong>${escapeHtml(issue.key)}</strong>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

function renderIssueDetailLoading(issue: DashboardIssue): string {
  return `
    <main class="detail-loading-indicator" role="status" aria-label="${escapeAttribute(issue.key)} details">
      <span class="detail-loading-spinner" aria-hidden="true"></span>
      <strong>${escapeHtml(issue.key)}</strong>
      <p>${escapeHtml(issue.summary)}</p>
    </main>
  `;
}

function renderIssueDetail(issue: DashboardIssue, detail: JiraIssueDetail): string {
  return `
    <main class="detail-shell" aria-label="${escapeAttribute(issue.key)} details">
      <header class="detail-page-header">
        <div class="detail-page-title">
          <span class="issue-key">${escapeHtml(issue.key)}</span>
          <h1 title="${escapeAttribute(issue.summary)}">${escapeHtml(issue.summary)}</h1>
        </div>
        <span class="detail-status-line">${escapeHtml(issue.status)}</span>
      </header>
      ${renderIssueContentSection(detail)}
      ${renderMergeRequestSection(issue)}
      ${renderCloneMergeRequestSection(issue)}
      ${renderWebLinksSection(issue)}
      ${renderAttachmentsSection(detail.attachments)}
    </main>
  `;
}

function renderIssueContentSection(detail: JiraIssueDetail): string {
  const description =
    detail.descriptionHtml.length > 0
      ? detail.descriptionHtml
      : '<p>No description was found for this issue.</p>';
  const content = `
    <div class="detail-content jira-adf-content">
      ${description}
      ${renderComments(detail.comments)}
    </div>
  `;
  return renderDetailSection('Issue content', null, content);
}

function renderComments(comments: readonly JiraIssueComment[]): string {
  if (comments.length === 0) {
    return '<p class="detail-muted">No comments were found for this issue.</p>';
  }

  return `<div class="detail-comment-list">${comments.map(renderComment).join('')}</div>`;
}

function renderComment(comment: JiraIssueComment): string {
  return `
    <article class="detail-comment">
      <div class="detail-comment-meta">
        <strong>${escapeHtml(comment.authorDisplayName)}</strong>
        <span>${escapeHtml(formatUpdated(comment.created))}</span>
      </div>
      <div class="jira-adf-content">${renderCommentBody(comment)}</div>
    </article>
  `;
}

function renderCommentBody(comment: JiraIssueComment): string {
  return comment.bodyHtml.length > 0
    ? comment.bodyHtml
    : `<p>${escapeHtml(comment.bodyText)}</p>`;
}

function renderMergeRequestSection(issue: DashboardIssue): string {
  const count = issue.mergeRequests.length;
  const content =
    count === 0
      ? '<p class="detail-muted">No GitLab merge requests were found for this issue.</p>'
      : `<div class="detail-grid">${issue.mergeRequests.map(renderMergeRequestLink).join('')}</div>`;

  return renderDetailSection('GitLab merge requests', count, content);
}

function renderCloneMergeRequestSection(issue: DashboardIssue): string {
  const count = issue.cloneMergeRequests.length;
  const content =
    count === 0
      ? '<p class="detail-muted">No GitLab merge requests were found on cloned Jira work items.</p>'
      : `<div class="detail-grid">${issue.cloneMergeRequests.map(renderCloneMergeRequestLink).join('')}</div>`;

  return renderDetailSection('Clone merge requests', count, content);
}

function renderWebLinksSection(issue: DashboardIssue): string {
  const count = issue.webLinks.length;
  const content =
    count === 0
      ? '<p class="detail-muted">No Jira remote web links were found for this issue.</p>'
      : `<div class="detail-grid">${issue.webLinks.map(renderWebLink).join('')}</div>`;

  return renderDetailSection('All Jira web links', count, content);
}

function renderAttachmentsSection(attachments: readonly JiraIssueAttachment[]): string {
  const content =
    attachments.length === 0
      ? '<p class="detail-muted">No attachments were found for this issue.</p>'
      : `<div class="attachment-grid">${attachments.map(renderAttachment).join('')}</div>`;
  return renderDetailSection('Attachments', attachments.length, content);
}

function renderMergeRequestLink(link: DashboardIssue['mergeRequests'][number]): string {
  return `
    <a class="detail-link detail-link-primary" href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer" data-url="${escapeAttribute(link.url)}">
      <strong>${escapeHtml(link.title)}</strong>
      <span>${escapeHtml(link.projectPath)} !${escapeHtml(link.iid)}</span>
    </a>
  `;
}

function renderCloneMergeRequestLink(
  link: DashboardIssue['cloneMergeRequests'][number]
): string {
  return `
    <a class="detail-link detail-link-primary" href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer" data-url="${escapeAttribute(link.url)}">
      <strong>${escapeHtml(link.title)}</strong>
      <span>Clone ticket ${escapeHtml(link.issueKey)} - ${escapeHtml(link.projectPath)} !${escapeHtml(link.iid)}</span>
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

function renderAttachment(attachment: JiraIssueAttachment): string {
  const image =
    attachment.imageDataUri !== null && isImageDataUri(attachment.imageDataUri)
      ? `<img src="${escapeAttribute(attachment.imageDataUri)}" alt="${escapeAttribute(attachment.filename)}" />`
      : '';
  return `
    <article class="attachment-card">
      ${image}
      <div class="attachment-meta">
        <strong>${escapeHtml(attachment.filename)}</strong>
        <span>${escapeHtml(attachment.mimeType)}</span>
      </div>
    </article>
  `;
}

function renderDetailSection(title: string, count: number | null, content: string): string {
  const countLabel = count === null ? '' : `<span>${String(count)}</span>`;
  return `
    <section class="detail-section" aria-label="${escapeAttribute(title)}">
      <div class="detail-section-heading">
        <h2>${escapeHtml(title)}</h2>
        ${countLabel}
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
    'img-src data:',
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

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isImageDataUri(value: string): boolean {
  return value.startsWith('data:image/');
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
