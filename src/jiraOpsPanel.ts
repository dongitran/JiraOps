import * as vscode from 'vscode';

import {
  JiraCredentialSetupCanceledError,
  applyJiraOAuthCredentialsToEnv,
  ensureJiraOAuthCredentials,
  getJiraOAuthCredentials,
  type JiraCredentialInputOptions,
} from './jiraCredentials';
import {
  fetchAssignedJiraIssues,
  fetchJiraRemoteLinks,
  OAuthJiraTokenProvider,
  type JiraAssignedIssue,
  type JiraConnectionStatus,
  type JiraTokens,
} from './jiraClient';
import {
  countIssueMergeRequests,
  createDashboardIssue,
  type CloneWebLinks,
  type DashboardIssue,
} from './dashboardItems';
import { showIssueDetailPanel } from './issueDetailPanel';
import {
  fetchJiraIssueDetail,
  hydrateIssueAttachmentImages,
  type JiraIssueDetail,
  type JiraLinkedCloneIssue,
} from './jiraIssueDetails';
import type { RemoteWebLink } from './remoteLinks';
import {
  isJiraOpsTestMode,
  resolveTestAssignedIssues,
  resolveTestIssueDetail,
  resolveTestRemoteLinks,
} from './testModeData';
import {
  CONNECTION_CHANGED_MESSAGE_TYPE,
  CONNECTION_LOADING_MESSAGE_TYPE,
  DASHBOARD_ERROR_MESSAGE_TYPE,
  DASHBOARD_LOADED_MESSAGE_TYPE,
  DASHBOARD_LOADING_MESSAGE_TYPE,
  isConnectJiraMessage,
  isDisconnectJiraMessage,
  isOpenExternalLinkMessage,
  isOpenIssueDetailMessage,
  isOpenSettingsMessage,
  isRefreshDashboardMessage,
  isWebviewReadyMessage,
  OPEN_SETTINGS_MESSAGE_TYPE,
} from './webviewMessages';

export const LINKS_VIEW_ID = 'jiraOps.linksView';

const WEBVIEW_ASSET_PATH = ['docs', 'designs', 'prototypes', 'assets'] as const;
const TEST_JIRA_CLOUD_NAME = 'Example Jira';

export class JiraOpsPanelProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private webviewView: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly dashboardIssues: DashboardIssue[] = [];
  private readonly issueDetails = new Map<string, JiraIssueDetail>();
  private testModeConnected = false;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly tokenProvider = new OAuthJiraTokenProvider()
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.title = 'JiraOps';
    this.updateViewConnectionHeader(false);
    const assetsRoot = vscode.Uri.joinPath(this.extensionUri, ...WEBVIEW_ASSET_PATH);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [assetsRoot],
    };

    const subscription = webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleWebviewMessage(message);
    });
    this.disposables.push(subscription);

    webviewView.webview.html = this.buildHtml(
      webviewView.webview,
      createNonce(),
      assetsRoot
    );
  }

  public dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  public async connectJiraFromCommand(): Promise<void> {
    await this.handleConnectJira();
  }

  public async disconnectJiraFromCommand(): Promise<void> {
    await this.handleDisconnectJira();
  }

  public openSettingsFromCommand(): void {
    this.handleOpenSettings();
  }

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (isWebviewReadyMessage(message)) {
      await this.handleWebviewReady();
      return;
    }

    if (isConnectJiraMessage(message)) {
      await this.handleConnectJira();
      return;
    }

    if (isDisconnectJiraMessage(message)) {
      await this.handleDisconnectJira();
      return;
    }

    if (isOpenSettingsMessage(message)) {
      this.handleOpenSettings();
      return;
    }

    if (isRefreshDashboardMessage(message)) {
      await this.handleRefreshDashboard();
      return;
    }

    if (isOpenIssueDetailMessage(message)) {
      await this.handleOpenIssueDetail(message.issueKey);
      return;
    }

    if (isOpenExternalLinkMessage(message)) {
      await this.handleOpenExternalLink(message.url);
    }
  }

  private async handleWebviewReady(): Promise<void> {
    this.outputChannel.appendLine('Jira Ops webview is ready.');
    const status = await this.loadConnectionStatus();
    this.postConnectionChanged(status, initialConnectionMessage(status));
    if (status.connected) {
      await this.handleRefreshDashboard();
    }
  }

  private async handleConnectJira(): Promise<void> {
    this.outputChannel.appendLine('Starting Jira connection.');
    this.updateViewConnectionHeader(false, 'Connecting');
    this.postMessage({ type: CONNECTION_LOADING_MESSAGE_TYPE });

    try {
      const status = await this.connectJira();
      this.outputChannel.appendLine('Jira connection is ready.');
      this.postConnectionChanged(status, '');
      await this.handleRefreshDashboard();
    } catch (error) {
      this.postMessage({
        type: DASHBOARD_ERROR_MESSAGE_TYPE,
        message: connectionErrorMessage(error),
      });
      this.updateViewConnectionHeader(false);
      this.outputChannel.appendLine('Jira connection failed.');
    }
  }

  private async handleDisconnectJira(): Promise<void> {
    this.outputChannel.appendLine('Clearing Jira connection.');
    try {
      const status = await this.disconnectJira();
      this.dashboardIssues.splice(0);
      this.issueDetails.clear();
      this.outputChannel.appendLine('Jira connection was cleared.');
      this.postConnectionChanged(status, 'Jira disconnected.');
    } catch {
      this.postMessage({
        type: DASHBOARD_ERROR_MESSAGE_TYPE,
        message: 'Jira connection could not be cleared.',
      });
      this.outputChannel.appendLine('Jira connection could not be cleared.');
    }
  }

  private async handleRefreshDashboard(): Promise<void> {
    this.outputChannel.appendLine('Refreshing assigned Jira tickets.');
    this.postMessage({ type: DASHBOARD_LOADING_MESSAGE_TYPE });

    try {
      this.issueDetails.clear();
      const issues = await this.loadDashboardIssues();
      this.dashboardIssues.splice(0, this.dashboardIssues.length, ...issues);
      this.outputChannel.appendLine(dashboardLoadedLogMessage(issues));
      this.postMessage({ type: DASHBOARD_LOADED_MESSAGE_TYPE, issues });
    } catch (error) {
      this.postMessage({
        type: DASHBOARD_ERROR_MESSAGE_TYPE,
        message:
          error instanceof JiraConnectionRequiredError
            ? 'Connect Jira before loading assigned tickets.'
            : 'Assigned tickets could not be loaded.',
      });
      this.outputChannel.appendLine('Assigned Jira ticket refresh failed.');
    }
  }

  private async handleOpenIssueDetail(issueKey: string): Promise<void> {
    const issue = this.dashboardIssues.find((item) => item.key === issueKey);
    if (issue === undefined) {
      this.outputChannel.appendLine(`Issue detail was requested before ${issueKey} was loaded.`);
      this.postMessage({
        type: DASHBOARD_ERROR_MESSAGE_TYPE,
        message: 'Issue details are not available. Refresh assigned tickets.',
      });
      return;
    }

    this.outputChannel.appendLine(`Opening Jira issue detail for ${issue.key}.`);
    try {
      const detail = await this.loadIssueDetailForDisplay(issue.key);
      showIssueDetailPanel({
        extensionUri: this.extensionUri,
        outputChannel: this.outputChannel,
        issue,
        detail,
      });
    } catch {
      this.outputChannel.appendLine(`Jira issue detail could not be loaded for ${issue.key}.`);
      this.postMessage({
        type: DASHBOARD_ERROR_MESSAGE_TYPE,
        message: 'Issue details could not be loaded.',
      });
    }
  }

  private handleOpenSettings(): void {
    this.outputChannel.appendLine('Opening Jira Ops settings.');
    this.postMessage({ type: OPEN_SETTINGS_MESSAGE_TYPE });
  }

  private async handleOpenExternalLink(url: string): Promise<void> {
    this.outputChannel.appendLine(`Opening Jira dashboard link on ${webLinkHost(url)}.`);
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async loadDashboardIssues(): Promise<DashboardIssue[]> {
    if (isJiraOpsTestMode()) {
      if (!this.testModeConnected) {
        throw new JiraConnectionRequiredError();
      }

      return this.createDashboardIssues(
        resolveTestAssignedIssues(),
        testRemoteLinksLoader,
        testIssueDetailLoader
      );
    }

    const tokens = await this.tokenProvider.getStoredOrRefreshTokens();
    if (tokens === null) {
      throw new JiraConnectionRequiredError();
    }

    const issues = await fetchAssignedJiraIssues({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
    });
    return this.createDashboardIssues(issues, (issueKey) => {
      return this.loadRemoteLinksWithTokens(tokens, issueKey);
    }, (issueKey) => {
      return this.loadIssueDetailWithTokens(tokens, issueKey, false);
    });
  }

  private async createDashboardIssues(
    issues: readonly JiraAssignedIssue[],
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>,
    loadDetail: (issueKey: string) => Promise<JiraIssueDetail>
  ): Promise<DashboardIssue[]> {
    const dashboardIssues: DashboardIssue[] = [];
    for (const issue of issues) {
      const links = await this.loadIssueRemoteLinks(issue.key, loadLinks);
      const detail = await this.loadIssueDetailForCloneLinks(issue.key, loadDetail);
      const cloneWebLinks = await this.loadCloneWebLinks(detail.linkedCloneIssues, loadLinks);
      dashboardIssues.push(
        createDashboardIssue(issue, links, {
          cloneWebLinks,
          linkedCloneIssues: detail.linkedCloneIssues,
        })
      );
    }
    return dashboardIssues;
  }

  private async loadIssueDetailForCloneLinks(
    issueKey: string,
    loadDetail: (issueKey: string) => Promise<JiraIssueDetail>
  ): Promise<JiraIssueDetail> {
    try {
      const detail = await loadDetail(issueKey);
      this.issueDetails.set(issueKey, detail);
      this.outputChannel.appendLine(
        `Loaded ${String(detail.linkedCloneIssues.length)} clone links for ${issueKey}.`
      );
      return detail;
    } catch {
      this.outputChannel.appendLine(`Clone links could not be loaded for ${issueKey}.`);
      return emptyIssueDetail(issueKey);
    }
  }

  private async loadCloneWebLinks(
    cloneIssues: readonly JiraLinkedCloneIssue[],
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>
  ): Promise<CloneWebLinks[]> {
    const cloneWebLinks: CloneWebLinks[] = [];
    for (const cloneIssue of cloneIssues.slice(0, 5)) {
      const webLinks = await this.loadIssueRemoteLinks(cloneIssue.key, loadLinks);
      cloneWebLinks.push({
        issueKey: cloneIssue.key,
        relationship: cloneIssue.relationship,
        webLinks,
      });
    }
    return cloneWebLinks;
  }

  private async loadIssueRemoteLinks(
    issueKey: string,
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>
  ): Promise<RemoteWebLink[]> {
    try {
      const links = await loadLinks(issueKey);
      this.outputChannel.appendLine(
        `Loaded ${String(links.length)} Jira web links for ${issueKey}.`
      );
      return links;
    } catch {
      this.outputChannel.appendLine(`Jira web links could not be loaded for ${issueKey}.`);
      return [];
    }
  }

  private async loadRemoteLinksWithTokens(
    tokens: JiraTokens,
    issueKey: string
  ): Promise<RemoteWebLink[]> {
    return fetchJiraRemoteLinks({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
      issueKey,
    });
  }

  private async loadIssueDetailForDisplay(issueKey: string): Promise<JiraIssueDetail> {
    if (isJiraOpsTestMode()) {
      return resolveTestIssueDetail(issueKey);
    }

    const tokens = await this.tokenProvider.getStoredOrRefreshTokens();
    if (tokens === null) {
      throw new JiraConnectionRequiredError();
    }

    return this.loadIssueDetailWithTokens(tokens, issueKey, true);
  }

  private async loadIssueDetailWithTokens(
    tokens: JiraTokens,
    issueKey: string,
    includeImages: boolean
  ): Promise<JiraIssueDetail> {
    const detail = await fetchJiraIssueDetail({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
      issueKey,
    });

    if (!includeImages) {
      return detail;
    }

    return hydrateIssueAttachmentImages(detail, {
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
    });
  }

  private async loadConnectionStatus(): Promise<JiraConnectionStatus> {
    if (isJiraOpsTestMode()) {
      return testConnectionStatus(this.testModeConnected);
    }

    await this.applyKnownJiraOAuthCredentials();
    return this.tokenProvider.getConnectionStatus();
  }

  private async connectJira(): Promise<JiraConnectionStatus> {
    if (isJiraOpsTestMode()) {
      this.testModeConnected = true;
      return testConnectionStatus(true);
    }

    await this.prepareJiraOAuthCredentials();
    return this.tokenProvider.connect();
  }

  private async disconnectJira(): Promise<JiraConnectionStatus> {
    if (isJiraOpsTestMode()) {
      this.testModeConnected = false;
      return testConnectionStatus(false);
    }

    return this.tokenProvider.disconnect();
  }

  private async applyKnownJiraOAuthCredentials(): Promise<void> {
    const credentials = await getJiraOAuthCredentials();
    applyJiraOAuthCredentialsToEnv(credentials);
  }

  private async prepareJiraOAuthCredentials(): Promise<void> {
    await ensureJiraOAuthCredentials({
      showInputBox: (options: JiraCredentialInputOptions) => {
        return vscode.window.showInputBox(options);
      },
    });
  }

  private postConnectionChanged(
    status: JiraConnectionStatus,
    message: string
  ): void {
    this.updateViewConnectionHeader(status.connected);
    this.postMessage({
      type: CONNECTION_CHANGED_MESSAGE_TYPE,
      connected: status.connected,
      cloudName: status.cloudName ?? '',
      message,
    });
  }

  private postMessage(message: Record<string, unknown>): void {
    void this.webviewView?.webview.postMessage(message);
  }

  private updateViewConnectionHeader(
    connected: boolean,
    label = connected ? 'Connected' : 'Not connected'
  ): void {
    if (this.webviewView === undefined) {
      return;
    }

    this.webviewView.title = label === 'Connected' ? 'Connected' : 'JiraOps';
    this.webviewView.description = label;
    this.outputChannel.appendLine(
      `Updated JiraOps view header connection state to ${label.toLowerCase()}.`
    );
  }

  private buildHtml(
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
}

function testRemoteLinksLoader(issueKey: string): Promise<RemoteWebLink[]> {
  return Promise.resolve(resolveTestRemoteLinks(issueKey));
}

function testIssueDetailLoader(issueKey: string): Promise<JiraIssueDetail> {
  return Promise.resolve(resolveTestIssueDetail(issueKey));
}

function emptyIssueDetail(issueKey: string): JiraIssueDetail {
  return {
    key: issueKey,
    summary: issueKey,
    status: '',
    statusCategory: '',
    priority: null,
    updated: '',
    descriptionText: '',
    comments: [],
    attachments: [],
    linkedCloneIssues: [],
  };
}

function buildCsp(webview: vscode.Webview, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
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

function testConnectionStatus(connected: boolean): JiraConnectionStatus {
  return {
    connected,
    cloudName: connected ? TEST_JIRA_CLOUD_NAME : null,
  };
}

function initialConnectionMessage(status: JiraConnectionStatus): string {
  return status.connected ? '' : 'Connect Jira to load assigned tickets.';
}

function connectionErrorMessage(error: unknown): string {
  if (error instanceof JiraCredentialSetupCanceledError) {
    return error.message;
  }

  if (error instanceof Error && isJiraCredentialSetupMessage(error.message)) {
    return error.message;
  }

  return 'Jira connection could not be completed.';
}

function isJiraCredentialSetupMessage(message: string): boolean {
  return message.startsWith('Jira OAuth client ');
}

function dashboardLoadedLogMessage(issues: readonly DashboardIssue[]): string {
  const issueCount = issues.length;
  const mergeRequestCount = countIssueMergeRequests(issues);
  return `Loaded ${String(issueCount)} assigned Jira tickets with ${String(mergeRequestCount)} GitLab merge requests.`;
}

function webLinkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown host';
  }
}

class JiraConnectionRequiredError extends Error {}
