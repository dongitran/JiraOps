import * as vscode from 'vscode';

import { applyJiraOAuthCredentialsToEnv, ensureJiraOAuthCredentials, getJiraOAuthCredentials } from './jiraCredentials';
import {
  buildAssignedIssuesSearchBody,
  fetchAssignedJiraIssues,
  fetchJiraIssueLatestChangelog,
  OAuthJiraTokenProvider,
  type JiraAssignedIssue,
  type JiraIssueChangelogEntry,
  type JiraConnectionStatus,
} from './jiraClient';
import { createDashboardIssue, type DashboardIssue } from './dashboardItems';
import { showIssueDetailPanel, type IssueDetailPanelHandle } from './issueDetailPanel';
import { JiraOpsIssueDetailController } from './jiraOpsIssueDetailController';
import {
  buildJiraOpsPanelHtml,
  connectionErrorMessage,
  createNonce,
  dashboardLoadedLogMessage,
  initialConnectionMessage,
  JiraConnectionRequiredError,
  resolveNotificationPollIntervalMs,
  testConnectionStatus,
  toAssignedIssue,
  waitForConfiguredDetailDelay,
  webLinkHost,
  type JiraCredentialInputOptions,
} from './jiraOpsPanelSupport';
import {
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markIssueNotificationsRead,
  seedAssignedIssueNotificationHistory,
  type IssueUpdateBaseline,
  type IssueUpdateNotificationResult,
  type JiraOpsNotification,
} from './jiraNotifications';
import {
  ensurePanelNotificationBaseline,
  persistPanelNotificationState,
  recordPanelNotificationBaseline,
  restorePanelNotificationState,
} from './jiraOpsPanelNotificationState';
import { readJiraOpsSettings, writeJiraOpsSettings, type JiraOpsSettings } from './jiraOpsSettings';
import { NotificationPoller } from './notificationPoller';
import {
  isJiraOpsTestMode,
  resolveTestAssignedIssues,
  resolveTestIssueLatestChangelog,
} from './testModeData';
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
  isOpenNotificationsMessage,
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

export class JiraOpsPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private webviewView: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly dashboardIssues: DashboardIssue[] = [];
  private readonly issueDetails: JiraOpsIssueDetailController;
  private readonly notificationPoller: NotificationPoller;
  private notificationBaseline: IssueUpdateBaseline = {};
  private notifications: readonly JiraOpsNotification[] = [];
  private testModeConnected = false;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly globalState: vscode.Memento,
    private readonly tokenProvider = new OAuthJiraTokenProvider()
  ) {
    this.notificationPoller = new NotificationPoller({
      fetchIssueChangelog: (issueKey) => this.fetchIssueLatestChangelog(issueKey),
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
    this.issueDetails = new JiraOpsIssueDetailController({
      applyAssignedIssues: (issues, source) => {
        this.applyAssignedIssues(issues, source);
      },
      loadAssignedIssues: () => this.loadAssignedIssues(),
      outputChannel: this.outputChannel,
      tokenProvider: this.tokenProvider,
    });
    const state = restorePanelNotificationState(
      this.globalState,
      this.notificationPoller,
      this.outputChannel
    );
    this.notificationBaseline = state.baseline;
    this.notifications = state.notifications;
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

    if (isOpenNotificationsMessage(message)) {
      await this.handleOpenNotifications();
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
      this.notificationBaseline = {};
      this.persistNotifications();
      this.postNotificationsChanged('Notification polling is paused.');
      this.issueDetails.clearCaches();
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
      this.recordBaseline(assignedIssues);
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
      this.ensureBaseline(assignedIssues);
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
    this.syncNotificationPollerState();
    this.persistNotifications();
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

    const cachedBundle = this.issueDetails.readCachedBundle(issue);
    if (cachedBundle !== null) {
      this.outputChannel.appendLine(`Opening cached Jira issue detail panel for ${issue.key}.`);
      showIssueDetailPanel({
        actions: this.issueDetails.createActions(),
        extensionUri: this.extensionUri,
        initialDetail: cachedBundle.detail,
        issue: cachedBundle.issue,
        outputChannel: this.outputChannel,
      });
      this.notifications = markIssueNotificationsRead(this.notifications, issue.key);
      this.syncNotificationPollerState();
      this.persistNotifications();
      this.postNotificationsChanged('Opened cached issue details.');
      return;
    }

    this.outputChannel.appendLine(`Opening Jira issue detail panel for ${issue.key}.`);
    const panel = showIssueDetailPanel({
      actions: this.issueDetails.createActions(),
      extensionUri: this.extensionUri,
      outputChannel: this.outputChannel,
      issue,
    });
    this.notifications = markIssueNotificationsRead(this.notifications, issue.key);
    this.syncNotificationPollerState();
    this.persistNotifications();
    this.postNotificationsChanged('Opening issue details.');
    void this.populateIssueDetailPanel(panel, issue);
  }

  private async populateIssueDetailPanel(panel: IssueDetailPanelHandle, issue: DashboardIssue): Promise<void> {
    try {
      await waitForConfiguredDetailDelay();
      const bundle = await this.issueDetails.loadBundle(issue);
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

  private async handleOpenNotifications(): Promise<void> {
    this.outputChannel.appendLine('Opening JiraOps notifications.');
    this.seedNotificationHistoryFromDashboard('notifications view');
    this.outputChannel.appendLine(
      `Loaded JiraOps notification history: ${String(this.notifications.length)} item(s), ${String(getUnreadNotificationCount(this.notifications))} unread.`
    );
    this.postNotificationsChanged('Notification history is loaded.');
    const status = await this.loadConnectionStatus();
    if (!status.connected) {
      return;
    }

    await this.notificationPoller.pollNow('notifications view');
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

    const searchBody = buildAssignedIssuesSearchBody();
    this.outputChannel.appendLine(
      `Running Jira assigned issue search with maxResults=${String(searchBody.maxResults)}, fields=${searchBody.fields.join(',')}, jql="${searchBody.jql}".`
    );
    const issues = await fetchAssignedJiraIssues({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
    });
    this.outputChannel.appendLine(`Fetched ${String(issues.length)} assigned Jira issue(s) from Jira.`);
    return issues;
  }

  private async fetchIssueLatestChangelog(
    issueKey: string
  ): Promise<JiraIssueChangelogEntry | null> {
    if (isJiraOpsTestMode()) {
      return resolveTestIssueLatestChangelog(issueKey);
    }

    try {
      const tokens = await this.tokenProvider.getStoredOrRefreshTokens();
      if (tokens === null) {
        this.outputChannel.appendLine(`Skipped Jira changelog enrichment for ${issueKey}: Jira is not connected.`);
        return null;
      }

      this.outputChannel.appendLine(`Fetching latest Jira changelog for ${issueKey}.`);
      const changelog = await fetchJiraIssueLatestChangelog({
        accessToken: tokens.accessToken,
        cloudId: tokens.cloudId,
        issueKey,
      });
      this.outputChannel.appendLine(
        changelog === null
          ? `No Jira changelog enrichment was available for ${issueKey}.`
          : `Loaded latest Jira changelog metadata for ${issueKey}.`
      );
      return changelog;
    } catch {
      this.outputChannel.appendLine(`Jira changelog enrichment failed for ${issueKey}.`);
      return null;
    }
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

  private recordBaseline(issues: readonly JiraAssignedIssue[]): void {
    this.notificationBaseline = recordPanelNotificationBaseline(this.globalState, this.notificationPoller, this.notifications, issues);
  }

  private ensureBaseline(issues: readonly JiraAssignedIssue[]): void {
    this.notificationBaseline = ensurePanelNotificationBaseline(this.globalState, this.notificationPoller, this.notificationBaseline, this.notifications, issues);
  }

  private persistNotifications(): void {
    persistPanelNotificationState(this.globalState, this.notificationBaseline, this.notifications);
  }

  private syncNotificationPollerState(): void {
    this.notificationPoller.restore({
      baseline: this.notificationBaseline,
      notifications: this.notifications,
    });
  }

  private seedNotificationHistoryFromDashboard(reason: string): void {
    if (this.notifications.length > 0) {
      this.outputChannel.appendLine('Skipped JiraOps notification history seed because history already exists.');
      return;
    }

    if (this.dashboardIssues.length === 0) {
      this.outputChannel.appendLine('Skipped JiraOps notification history seed because no assigned tickets are loaded.');
      return;
    }

    const seededNotifications = seedAssignedIssueNotificationHistory({
      existingNotifications: this.notifications,
      issues: this.dashboardIssues.map(toAssignedIssue),
    });
    const seededCount = seededNotifications.length - this.notifications.length;
    this.notifications = seededNotifications;
    this.syncNotificationPollerState();
    this.persistNotifications();
    this.outputChannel.appendLine(
      `Seeded JiraOps notification history with ${String(seededCount)} current assigned issue activity item(s) for ${reason}.`
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
    this.notificationBaseline = result.nextBaseline;
    this.persistNotifications();
    const count = result.newNotifications.length;
    this.outputChannel.appendLine(
      `Persisted JiraOps notification state: ${String(this.notifications.length)} item(s), ${String(getUnreadNotificationCount(this.notifications))} unread, ${String(Object.keys(this.notificationBaseline).length)} baseline issue(s).`
    );
    this.postNotificationsChanged('Notification polling is current.');
    if (count === 0) {
      return;
    }

    if (count === 1) {
      void vscode.window.showInformationMessage(
        result.newNotifications[0]?.title ?? 'JiraOps found an assigned issue update.'
      );
      return;
    }

    void vscode.window.showInformationMessage(
      `JiraOps found ${String(count)} assigned issue updates.`
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
