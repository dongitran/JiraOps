import * as vscode from 'vscode';

import type { DashboardIssue } from './dashboardItems';
import type { CloneMergeRequestInput, CloneMergeRequestResult } from './gitportClone';
import {
  renderCloneDialog,
  renderCloneMergeRequestSection,
} from './issueDetailCloneControls';
import { ISSUE_DETAIL_SCRIPT_BODY } from './issueDetailPanelScript';
import type { JiraIssueAttachment, JiraIssueComment, JiraIssueDetail, JiraIssueTransition } from './jiraIssueDetails';
import { isCloneMergeRequestMessage, isLogWorkMessage, isOpenExternalLinkMessage, isTransitionIssueMessage } from './webviewMessages';

const WEBVIEW_ASSET_PATH = ['docs', 'designs', 'prototypes', 'assets'] as const;

export interface ShowIssueDetailPanelOptions {
  readonly actions?: IssueDetailActionHandlers;
  readonly extensionUri: vscode.Uri;
  readonly initialDetail?: JiraIssueDetail;
  readonly outputChannel: vscode.OutputChannel;
  readonly issue: DashboardIssue;
}

export interface IssueDetailPanelHandle {
  showLoaded(issue: DashboardIssue, detail: JiraIssueDetail): void;
  showError(message: string): void;
}

export interface IssueDetailActionHandlers {
  readonly cloneMergeRequest: (
    input: CloneMergeRequestInput
  ) => Promise<CloneMergeRequestResult>;
  readonly logWork: (
    issueKey: string,
    minutes: number,
    comment: string
  ) => Promise<IssueDetailActionResult>;
  readonly transitionIssue: (
    issueKey: string,
    transitionId: string
  ) => Promise<IssueDetailActionResult>;
}

export interface IssueDetailActionResult {
  readonly message: string;
  readonly status?: string;
}

interface IssueDetailPanelHandleOptions {
  readonly panel: vscode.WebviewPanel;
  readonly assetsRoot: vscode.Uri;
  readonly nonce: string;
  readonly issue: DashboardIssue;
  readonly isDisposed: () => boolean;
  readonly onLoadedIssue: (issue: DashboardIssue) => void;
}

export function showIssueDetailPanel(
  options: ShowIssueDetailPanelOptions
): IssueDetailPanelHandle {
  const assetsRoot = vscode.Uri.joinPath(options.extensionUri, ...WEBVIEW_ASSET_PATH);
  const panel = createIssueDetailWebviewPanel(options.issue, assetsRoot);
  const nonce = createNonce();
  let disposed = false;
  let allowedCloneMrUrls = toCloneMrUrlSet(options.issue);
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
    void handleDetailMessage(
      message,
      options.outputChannel,
      panel.webview,
      options.actions,
      options.issue.key,
      () => allowedCloneMrUrls
    );
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
    onLoadedIssue: (issue) => {
      allowedCloneMrUrls = toCloneMrUrlSet(issue);
    },
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

      options.onLoadedIssue(issue);
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
  outputChannel: vscode.OutputChannel,
  webview: vscode.Webview,
  actions: IssueDetailActionHandlers | undefined,
  expectedIssueKey: string,
  allowedCloneMrUrls: () => ReadonlySet<string>
): Promise<void> {
  if (isOpenExternalLinkMessage(message)) {
    outputChannel.appendLine(`Opening Jira issue detail link on ${webLinkHost(message.url)}.`);
    await vscode.env.openExternal(vscode.Uri.parse(message.url));
    return;
  }

  if (isTransitionIssueMessage(message)) {
    if (!isExpectedDetailIssue(message.issueKey, expectedIssueKey, webview)) {
      return;
    }
    await runDetailAction(webview, () => {
      return actions?.transitionIssue(message.issueKey, message.transitionId);
    });
    return;
  }

  if (isLogWorkMessage(message)) {
    if (!isExpectedDetailIssue(message.issueKey, expectedIssueKey, webview)) {
      return;
    }
    await runDetailAction(webview, () => {
      return actions?.logWork(message.issueKey, message.minutes, message.comment);
    });
    return;
  }

  if (isCloneMergeRequestMessage(message)) {
    if (!isExpectedDetailIssue(message.issueKey, expectedIssueKey, webview)) {
      return;
    }
    if (!allowedCloneMrUrls().has(message.sourceMrUrl)) {
      await postCloneMergeRequestResult(webview, {
        mergeRequestCreated: false,
        message: 'Clone action did not match this issue detail panel.',
        sourceMrUrl: message.sourceMrUrl,
        success: false,
      });
      return;
    }
    await runCloneMergeRequestAction(webview, message.sourceMrUrl, () => {
      return actions?.cloneMergeRequest(message);
    });
  }
}

function isExpectedDetailIssue(
  messageIssueKey: string,
  expectedIssueKey: string,
  webview: vscode.Webview
): boolean {
  if (messageIssueKey === expectedIssueKey) {
    return true;
  }

  void postDetailActionResult(webview, {
    message: 'Jira action did not match this issue detail panel.',
    status: '',
    success: false,
  });
  return false;
}

async function runDetailAction(
  webview: vscode.Webview,
  action: () => Promise<IssueDetailActionResult> | undefined
): Promise<void> {
  try {
    const result = await action();
    if (result === undefined) {
      throw new Error('Jira action could not be completed.');
    }
    await postDetailActionResult(webview, {
      message: result.message,
      status: result.status ?? '',
      success: true,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'Jira action could not be completed.';
    await postDetailActionResult(webview, {
      message,
      status: '',
      success: false,
    });
  }
}

async function postDetailActionResult(
  webview: vscode.Webview,
  result: { readonly message: string; readonly status: string; readonly success: boolean }
): Promise<void> {
  await webview.postMessage({
    type: 'jiraOps.detailActionResult',
    ...result,
  });
}

async function runCloneMergeRequestAction(
  webview: vscode.Webview,
  sourceMrUrl: string,
  action: () => Promise<CloneMergeRequestResult> | undefined
): Promise<void> {
  try {
    const result = await action();
    if (result === undefined) {
      throw new Error('Merge request could not be cloned.');
    }
    await postCloneMergeRequestResult(webview, {
      mergeRequestCreated: result.mergeRequestCreated,
      mergeRequestUrl: result.mergeRequestUrl,
      message: result.message,
      sourceMrUrl,
      success: true,
    });
  } catch (error) {
    await postCloneMergeRequestResult(webview, {
      mergeRequestCreated: false,
      message: errorMessage(error, 'Merge request could not be cloned.'),
      sourceMrUrl,
      success: false,
    });
  }
}

async function postCloneMergeRequestResult(
  webview: vscode.Webview,
  result: {
    readonly mergeRequestCreated: boolean;
    readonly mergeRequestUrl?: string | undefined;
    readonly message: string;
    readonly sourceMrUrl: string;
    readonly success: boolean;
  }
): Promise<void> {
  await webview.postMessage({
    type: 'jiraOps.cloneMergeRequestResult',
    ...result,
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
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
    <script nonce="${nonce}">${ISSUE_DETAIL_SCRIPT_BODY}</script>
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
      ${renderIssueDetailHeader(issue, detail)}
      ${renderIssueContentSection(detail)}
      ${renderMergeRequestSection(issue)}
      ${renderCloneMergeRequestSection(issue)}
      ${renderWebLinksSection(issue)}
      ${renderActivitySection(detail)}
      ${renderTechnicalNotesSection(detail)}
      ${renderAttachmentsSection(detail.attachments)}
      ${renderCloneDialog(issue)}
      ${renderWorklogDialog(issue)}
      ${renderImageLightboxDialog()}
    </main>
  `;
}

function renderIssueDetailHeader(issue: DashboardIssue, detail: JiraIssueDetail): string {
  return `
    <header class="detail-page-header">
      <div class="detail-page-title">
        <h1 title="${escapeAttribute(issue.summary)}">${escapeHtml(issue.summary)}</h1>
      </div>
      <div class="detail-page-meta-row">
        <span class="issue-key">${escapeHtml(issue.key)}</span>
        ${renderHeaderActions(issue, detail)}
      </div>
    </header>
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
  return `
    <section class="detail-section detail-content-section" aria-label="Description and comments">
      ${content}
    </section>
  `;
}

function renderHeaderActions(issue: DashboardIssue, detail: JiraIssueDetail): string {
  return `
    <div class="detail-header-actions" aria-label="Issue actions">
      <label class="detail-status-control">
        <span class="visually-hidden">Issue status</span>
        <select name="transition" aria-label="Issue status" data-detail-status-select data-issue-key="${escapeAttribute(issue.key)}" ${detail.transitions.length === 0 ? 'disabled' : ''}>
          ${renderTransitionOptions(issue.status, detail.transitions)}
        </select>
      </label>
      <button class="detail-log-work-button" type="button" data-detail-action="open-worklog">Log Work</button>
      <p class="detail-action-status" role="status" aria-live="polite"></p>
    </div>
  `;
}

function renderTransitionOptions(
  currentStatus: string,
  transitions: readonly JiraIssueTransition[]
): string {
  const current = `<option value="" data-status="${escapeAttribute(currentStatus)}" selected>${escapeHtml(currentStatus)}</option>`;
  if (transitions.length === 0) {
    return current;
  }

  const transitionOptions = transitions
    .map((transition) => {
      return `<option value="${escapeAttribute(transition.id)}" data-status="${escapeAttribute(transition.toStatus)}">${escapeHtml(transition.toStatus)}</option>`;
    })
    .join('');
  return `${current}${transitionOptions}`;
}

function renderWorklogDialog(issue: DashboardIssue): string {
  return `
    <dialog class="detail-worklog-dialog" aria-label="Log Work">
      <form class="detail-worklog-form" data-detail-action="work" data-issue-key="${escapeAttribute(issue.key)}">
        <div class="detail-dialog-heading">
          <div>
            <span>${escapeHtml(issue.key)}</span>
            <h2>Log Work</h2>
          </div>
          <button type="button" class="detail-dialog-close" data-detail-action="close-worklog" aria-label="Close Log Work">&times;</button>
        </div>
        <label>
          <span>Minutes</span>
          <input name="minutes" type="number" min="1" max="1440" inputmode="numeric" autocomplete="off" value="30" />
        </label>
        <label>
          <span>Note</span>
          <textarea name="comment" rows="4" autocomplete="off" placeholder="Add a short work note&hellip;"></textarea>
        </label>
        <p class="detail-dialog-status" role="status" aria-live="polite"></p>
        <div class="detail-dialog-actions">
          <button type="button" class="detail-dialog-secondary" data-detail-action="close-worklog">Cancel</button>
          <button type="submit" class="detail-dialog-primary" data-detail-action="submit-worklog">Log Work</button>
        </div>
      </form>
    </dialog>
  `;
}

function renderImageLightboxDialog(): string {
  return `
    <dialog class="detail-image-lightbox-dialog" aria-label="Image viewer">
      <button class="detail-image-lightbox-close" type="button" aria-label="Close image viewer">&times;</button>
      <figure class="detail-image-lightbox-figure">
        <img class="detail-image-lightbox-img" src="" alt="" />
      </figure>
    </dialog>
  `;
}

function renderTechnicalNotesSection(detail: JiraIssueDetail): string {
  if (detail.technicalNotesHtml.length === 0) {
    return '';
  }

  const content = `
    <div class="detail-technical-notes jira-adf-content">
      ${detail.technicalNotesHtml}
    </div>
  `;
  return renderDetailSection('Technical notes', null, content);
}

function renderActivitySection(detail: JiraIssueDetail): string {
  if (detail.activityHtml.length === 0) {
    return '';
  }

  const content = `
    <div class="detail-content jira-adf-content">
      ${detail.activityHtml}
    </div>
  `;
  return renderDetailSection('Activity', null, content);
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
    <a class="detail-link detail-link-primary" href="${escapeAttribute(link.url)}" data-url="${escapeAttribute(link.url)}">
      <strong>${escapeHtml(link.title)}</strong>
      <span>${escapeHtml(link.projectPath)} !${escapeHtml(link.iid)}</span>
    </a>
  `;
}

function renderWebLink(link: DashboardIssue['webLinks'][number]): string {
  return `
    <a class="detail-link" href="${escapeAttribute(link.url)}" data-url="${escapeAttribute(link.url)}">
      <strong>${escapeHtml(link.title)}</strong>
      <span>${escapeHtml(link.relationship)} - ${escapeHtml(link.host)}</span>
    </a>
  `;
}

function renderAttachment(attachment: JiraIssueAttachment): string {
  return `
    <article class="attachment-card">
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

function toCloneMrUrlSet(issue: DashboardIssue): ReadonlySet<string> {
  return new Set(issue.cloneMergeRequests.map((link) => link.url));
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
