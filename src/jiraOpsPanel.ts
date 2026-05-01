import * as vscode from 'vscode';

import {
  applyJiraOAuthCredentialsToEnv,
  ensureJiraOAuthCredentials,
  getJiraOAuthCredentials,
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
  createDashboardIssue,
  type CloneWebLinks,
  type DashboardIssue,
} from './dashboardItems';
import {
  readCachedIssueDetailBundle,
  type CachedIssueDetailBundle,
} from './cachedIssueDetailBundle';
import { showIssueDetailPanel, type IssueDetailPanelHandle } from './issueDetailPanel';
import {
  fetchJiraIssueDetail,
  hydrateIssueAttachmentImages,
  type JiraIssueDetail,
  type JiraLinkedCloneIssue,
} from './jiraIssueDetails';
import {
  buildJiraOpsPanelHtml,
  connectionErrorMessage,
  createNonce,
  dashboardLoadedLogMessage,
  initialConnectionMessage,
  JiraConnectionRequiredError,
  resolveNotificationPollIntervalMs,
  testConnectionStatus,
  testIssueDetailLoader,
  testRemoteLinksLoader,
  toAssignedIssue,
  waitForConfiguredDetailDelay,
  webLinkHost,
  type JiraCredentialInputOptions,
} from './jiraOpsPanelSupport';
import {
  markAllNotificationsRead,
  markIssueNotificationsRead,
  type IssueUpdateNotificationResult,
  type JiraOpsNotification,
} from './jiraNotifications';
import {
  readJiraOpsSettings,
  writeJiraOpsSettings,
  type JiraOpsSettings,
} from './jiraOpsSettings';
import { NotificationPoller } from './notificationPoller';
import type { RemoteWebLink } from './remoteLinks';
import {
  isJiraOpsTestMode,
  resolveTestAssignedIssues,
} from './testModeData';
import { TtlCache, type TtlCacheResult } from './ttlCache';
import {
  CONNECTION_CHANGED_MESSAGE_TYPE,
  CONNECTION_LOADING_MESSAGE_TYPE,
  DASHBOARD_ERROR_MESSAGE_TYPE,
  DASHBOARD_LOADED_MESSAGE_TYPE,
  DASHBOARD_LOADING_MESSAGE_TYPE,
  isClearNotificationsMessage,
  isConnectJiraMessage,
  isDisconnectJiraMessage,
  isOpenExternalLinkMessage,
  isOpenIssueDetailMessage,
  isOpenSettingsMessage,
  isRefreshDashboardMessage,
  isUpdateSettingsMessage,
  isWebviewReadyMessage,
  NOTIFICATIONS_CHANGED_MESSAGE_TYPE,
  OPEN_SETTINGS_MESSAGE_TYPE,
  SETTINGS_CHANGED_MESSAGE_TYPE,
} from './webviewMessages';

export const LINKS_VIEW_ID = 'jiraOps.linksView';

const WEBVIEW_ASSET_PATH = ['docs', 'designs', 'prototypes', 'assets'] as const;
const JIRA_DETAIL_CACHE_TTL_MS = 5 * 60_000;
const JIRA_REMOTE_LINK_CACHE_TTL_MS = 5 * 60_000;
const MAX_CLONE_ISSUES_TO_LOAD = 10;

export class JiraOpsPanelProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private webviewView: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly dashboardIssues: DashboardIssue[] = [];
  private readonly issueDetailCache = new TtlCache<JiraIssueDetail>(
    JIRA_DETAIL_CACHE_TTL_MS
  );
  private readonly remoteLinksCache = new TtlCache<readonly RemoteWebLink[]>(
    JIRA_REMOTE_LINK_CACHE_TTL_MS
  );
  private readonly notificationPoller: NotificationPoller;
  private notifications: readonly JiraOpsNotification[] = [];
  private testModeConnected = false;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly globalState: vscode.Memento,
    private readonly tokenProvider = new OAuthJiraTokenProvider()
  ) {
    this.notificationPoller = new NotificationPoller({
      fetchIssues: () => this.loadAssignedIssues(),
      log: (message) => {
        this.outputChannel.appendLine(message);
      },
      onError: (error) => {
        this.handleNotificationPollError(error);
      },
      onIssues: (issues) => {
        this.applyAssignedIssues(issues, 'notification poll');
      },
      onNotifications: (result) => {
        this.handleNotificationPollResult(result);
      },
      readSettings: () => Promise.resolve(readJiraOpsSettings(this.globalState)),
      resolveIntervalMs: (settings) => resolveNotificationPollIntervalMs(settings),
    });
  }

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

    webviewView.webview.html = buildJiraOpsPanelHtml(
      webviewView.webview,
      createNonce(),
      assetsRoot
    );
  }

  public dispose(): void {
    this.notificationPoller.dispose();
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
      this.handleOpenIssueDetail(message.issueKey);
      return;
    }

    if (isOpenExternalLinkMessage(message)) {
      await this.handleOpenExternalLink(message.url);
      return;
    }

    if (isUpdateSettingsMessage(message)) {
      await this.handleUpdateSettings(message.notificationsEnabled, message.pollIntervalMinutes);
      return;
    }

    if (isClearNotificationsMessage(message)) {
      this.handleClearNotifications();
    }
  }

  private async handleWebviewReady(): Promise<void> {
    this.outputChannel.appendLine('Jira Ops webview is ready.');
    this.postSettingsChanged();
    this.postNotificationsChanged('Notification polling is ready.');
    const status = await this.loadConnectionStatus();
    this.postConnectionChanged(status, initialConnectionMessage(status));
    if (status.connected) {
      await this.loadInitialDashboardAndStartPolling();
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
      await this.loadInitialDashboardAndStartPolling();
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
      this.notificationPoller.dispose();
      this.notifications = [];
      this.postNotificationsChanged('Notification polling is paused.');
      this.clearIssueCaches();
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
      const assignedIssues = await this.loadAssignedIssues();
      this.notificationPoller.prime(assignedIssues);
      this.applyAssignedIssues(assignedIssues, 'manual refresh');
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

  private async loadInitialDashboardAndStartPolling(): Promise<void> {
    this.postMessage({ type: DASHBOARD_LOADING_MESSAGE_TYPE });
    try {
      const assignedIssues = await this.loadAssignedIssues();
      this.notificationPoller.prime(assignedIssues);
      this.applyAssignedIssues(assignedIssues, 'initial load');
      await this.notificationPoller.start();
    } catch (error) {
      this.postMessage({
        type: DASHBOARD_ERROR_MESSAGE_TYPE,
        message:
          error instanceof JiraConnectionRequiredError
            ? 'Connect Jira before loading assigned tickets.'
            : 'Assigned tickets could not be loaded.',
      });
      this.outputChannel.appendLine('Initial assigned Jira ticket load failed.');
    }
  }

  private async handleUpdateSettings(notificationsEnabled: boolean, pollIntervalMinutes: number): Promise<void> {
    const settings = await writeJiraOpsSettings(this.globalState, {
      notificationPollIntervalMinutes: pollIntervalMinutes,
      notificationsEnabled,
    });
    this.outputChannel.appendLine(`Saved JiraOps notification polling settings: enabled=${String(settings.notificationsEnabled)}, interval=${String(settings.notificationPollIntervalMinutes)} minute(s).`);
    this.postSettingsChanged(settings);
    const status = await this.loadConnectionStatus();
    if (status.connected) {
      await this.notificationPoller.restart();
      return;
    }

    this.notificationPoller.dispose();
    this.postNotificationsChanged('Notification polling is paused.');
  }

  private handleClearNotifications(): void {
    this.notifications = markAllNotificationsRead(this.notifications);
    this.outputChannel.appendLine('Marked JiraOps notifications as read.');
    this.postNotificationsChanged('Notifications marked as read.');
  }

  private handleOpenIssueDetail(issueKey: string): void {
    const issue = this.dashboardIssues.find((item) => item.key === issueKey);
    if (issue === undefined) {
      this.outputChannel.appendLine(`Issue detail was requested before ${issueKey} was loaded.`);
      this.postMessage({
        type: DASHBOARD_ERROR_MESSAGE_TYPE,
        message: 'Issue details are not available. Refresh assigned tickets.',
      });
      return;
    }

    const cachedBundle = readCachedIssueDetailBundle({
      detailCache: this.issueDetailCache,
      issue,
      maxCloneIssues: MAX_CLONE_ISSUES_TO_LOAD,
      remoteLinksCache: this.remoteLinksCache,
    });
    if (cachedBundle !== null) {
      this.outputChannel.appendLine(`Opening cached Jira issue detail panel for ${issue.key}.`);
      showIssueDetailPanel({
        extensionUri: this.extensionUri,
        initialDetail: cachedBundle.detail,
        issue: cachedBundle.issue,
        outputChannel: this.outputChannel,
      });
      this.notifications = markIssueNotificationsRead(this.notifications, issue.key);
      this.postNotificationsChanged('Opened cached issue details.');
      return;
    }

    this.outputChannel.appendLine(`Opening Jira issue detail panel for ${issue.key}.`);
    const panel = showIssueDetailPanel({
      extensionUri: this.extensionUri,
      outputChannel: this.outputChannel,
      issue,
    });
    this.notifications = markIssueNotificationsRead(this.notifications, issue.key);
    this.postNotificationsChanged('Opening issue details.');
    void this.populateIssueDetailPanel(panel, issue);
  }

  private async populateIssueDetailPanel(panel: IssueDetailPanelHandle, issue: DashboardIssue): Promise<void> {
    try {
      await waitForConfiguredDetailDelay();
      const bundle = await this.loadIssueDetailBundle(issue);
      panel.showLoaded(bundle.issue, bundle.detail);
      this.outputChannel.appendLine(`Jira issue detail loaded for ${issue.key}.`);
    } catch {
      this.outputChannel.appendLine(`Jira issue detail could not be loaded for ${issue.key}.`);
      panel.showError('Issue details could not be loaded.');
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

  private async loadAssignedIssues(): Promise<readonly JiraAssignedIssue[]> {
    if (isJiraOpsTestMode()) {
      if (!this.testModeConnected) {
        throw new JiraConnectionRequiredError();
      }

      return resolveTestAssignedIssues();
    }

    const tokens = await this.tokenProvider.getStoredOrRefreshTokens();
    if (tokens === null) {
      throw new JiraConnectionRequiredError();
    }

    return fetchAssignedJiraIssues({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
    });
  }

  private applyAssignedIssues(
    issues: readonly JiraAssignedIssue[],
    source: string
  ): void {
    const dashboardIssues = this.createDashboardIssues(issues);
    this.dashboardIssues.splice(0, this.dashboardIssues.length, ...dashboardIssues);
    this.outputChannel.appendLine(
      `${dashboardLoadedLogMessage(dashboardIssues)} Source: ${source}.`
    );
    this.postMessage({
      type: DASHBOARD_LOADED_MESSAGE_TYPE,
      issues: dashboardIssues,
    });
  }

  private createDashboardIssues(issues: readonly JiraAssignedIssue[]): DashboardIssue[] {
    return issues.map((issue) => {
      return createDashboardIssue(issue, []);
    });
  }

  private async loadCloneWebLinks(
    cloneIssues: readonly JiraLinkedCloneIssue[],
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>
  ): Promise<CloneWebLinks[]> {
    const cloneWebLinks: CloneWebLinks[] = [];
    for (const cloneIssue of cloneIssues.slice(0, MAX_CLONE_ISSUES_TO_LOAD)) {
      const webLinks = await this.loadRemoteLinksFromCache(cloneIssue.key, loadLinks);
      cloneWebLinks.push({
        issueKey: cloneIssue.key,
        relationship: cloneIssue.relationship,
        webLinks,
      });
    }
    return cloneWebLinks;
  }

  private async loadIssueDetailBundle(
    issue: DashboardIssue
  ): Promise<CachedIssueDetailBundle> {
    if (isJiraOpsTestMode()) {
      return this.loadIssueDetailBundleWithLoaders(
        issue,
        testIssueDetailLoader,
        testRemoteLinksLoader
      );
    }

    const tokens = await this.tokenProvider.getStoredOrRefreshTokens();
    if (tokens === null) {
      throw new JiraConnectionRequiredError();
    }

    return this.loadIssueDetailBundleWithLoaders(
      issue,
      (issueKey) => {
        return this.loadIssueDetailWithTokens(tokens, issueKey);
      },
      (issueKey) => {
        return this.loadRemoteLinksWithTokens(tokens, issueKey);
      }
    );
  }

  private async loadIssueDetailBundleWithLoaders(
    issue: DashboardIssue,
    loadDetail: (issueKey: string) => Promise<JiraIssueDetail>,
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>
  ): Promise<CachedIssueDetailBundle> {
    const detail = await this.loadIssueDetailFromCache(issue.key, loadDetail);
    const webLinks = await this.loadRemoteLinksFromCache(issue.key, loadLinks);
    const cloneWebLinks = await this.loadCloneWebLinks(detail.linkedCloneIssues, loadLinks);
    return {
      issue: createDashboardIssue(toAssignedIssue(issue), webLinks, {
        cloneWebLinks,
        linkedCloneIssues: detail.linkedCloneIssues,
      }),
      detail,
    };
  }

  private async loadIssueDetailFromCache(
    issueKey: string,
    loadDetail: (issueKey: string) => Promise<JiraIssueDetail>
  ): Promise<JiraIssueDetail> {
    const cached = this.issueDetailCache.get(issueKey);
    this.logCacheResult('Jira issue detail', issueKey, cached);
    if (cached.status === 'hit') {
      return cached.value;
    }

    this.outputChannel.appendLine(`Fetching Jira issue detail for ${issueKey}.`);
    const detail = await loadDetail(issueKey);
    this.issueDetailCache.set(issueKey, detail);
    this.outputChannel.appendLine(
      `Loaded Jira issue detail for ${issueKey} with ${String(detail.comments.length)} comments and ${String(detail.attachments.length)} attachments.`
    );
    return detail;
  }

  private async loadRemoteLinksFromCache(
    issueKey: string,
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>
  ): Promise<RemoteWebLink[]> {
    const cached = this.remoteLinksCache.get(issueKey);
    this.logCacheResult('Jira remote links', issueKey, cached);
    if (cached.status === 'hit') {
      return [...cached.value];
    }

    this.outputChannel.appendLine(`Fetching Jira remote links for ${issueKey}.`);
    try {
      const links = await loadLinks(issueKey);
      this.remoteLinksCache.set(issueKey, links);
      this.outputChannel.appendLine(
        `Loaded ${String(links.length)} Jira remote links for ${issueKey}.`
      );
      return links;
    } catch {
      this.outputChannel.appendLine(`Jira remote links could not be loaded for ${issueKey}.`);
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

  private async loadIssueDetailWithTokens(
    tokens: JiraTokens,
    issueKey: string
  ): Promise<JiraIssueDetail> {
    const detail = await fetchJiraIssueDetail({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
      issueKey,
    });

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

  private clearIssueCaches(): void {
    this.issueDetailCache.clear();
    this.remoteLinksCache.clear();
    this.outputChannel.appendLine('Cleared cached Jira issue details and remote links.');
  }

  private logCacheResult<T>(
    label: string,
    issueKey: string,
    result: TtlCacheResult<T>
  ): void {
    this.outputChannel.appendLine(
      `${label} cache ${result.status} for ${issueKey}.`
    );
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

  private postSettingsChanged(settings?: JiraOpsSettings): void {
    const resolvedSettings = settings ?? readJiraOpsSettings(this.globalState);
    this.postMessage({
      type: SETTINGS_CHANGED_MESSAGE_TYPE,
      notificationsEnabled: resolvedSettings.notificationsEnabled,
      pollIntervalMinutes: resolvedSettings.notificationPollIntervalMinutes,
    });
  }

  private postNotificationsChanged(pollStatus: string): void {
    this.postMessage({
      type: NOTIFICATIONS_CHANGED_MESSAGE_TYPE,
      notifications: this.notifications,
      pollStatus,
    });
  }

  private handleNotificationPollResult(
    result: IssueUpdateNotificationResult
  ): void {
    this.notifications = result.notifications;
    const count = result.newNotifications.length;
    this.postNotificationsChanged('Checked assigned issue updates just now.');
    if (count === 0) {
      return;
    }

    void vscode.window.showInformationMessage(
      `JiraOps found ${String(count)} assigned issue update${count === 1 ? '' : 's'}.`
    );
  }

  private handleNotificationPollError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown poll error';
    this.outputChannel.appendLine(`JiraOps notification poll failed: ${message}`);
    this.postNotificationsChanged('Last assigned issue update check failed.');
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

}
