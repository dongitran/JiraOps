export const WEBVIEW_READY_MESSAGE_TYPE = 'jiraOps.webviewReady';
export const REFRESH_DASHBOARD_MESSAGE_TYPE = 'jiraOps.refreshDashboard';
export const OPEN_ISSUE_DETAIL_MESSAGE_TYPE = 'jiraOps.openIssueDetail';
export const CONNECT_JIRA_MESSAGE_TYPE = 'jiraOps.connectJira';
export const DISCONNECT_JIRA_MESSAGE_TYPE = 'jiraOps.disconnectJira';
export const OPEN_SETTINGS_MESSAGE_TYPE = 'jiraOps.openSettings';
export const OPEN_NOTIFICATIONS_MESSAGE_TYPE = 'jiraOps.openNotifications';
export const OPEN_EXTERNAL_LINK_MESSAGE_TYPE = 'jiraOps.openExternalLink';
export const UPDATE_SETTINGS_MESSAGE_TYPE = 'jiraOps.updateSettings';
export const CLEAR_NOTIFICATIONS_MESSAGE_TYPE = 'jiraOps.clearNotifications';
export const TRANSITION_ISSUE_MESSAGE_TYPE = 'jiraOps.transitionIssue';
export const LOG_WORK_MESSAGE_TYPE = 'jiraOps.logWork';
export const DASHBOARD_LOADING_MESSAGE_TYPE = 'jiraOps.dashboardLoading';
export const DASHBOARD_LOADED_MESSAGE_TYPE = 'jiraOps.dashboardLoaded';
export const DASHBOARD_ERROR_MESSAGE_TYPE = 'jiraOps.dashboardError';
export const CONNECTION_LOADING_MESSAGE_TYPE = 'jiraOps.connectionLoading';
export const CONNECTION_CHANGED_MESSAGE_TYPE = 'jiraOps.connectionChanged';
export const NOTIFICATIONS_CHANGED_MESSAGE_TYPE = 'jiraOps.notificationsChanged';
export const SETTINGS_CHANGED_MESSAGE_TYPE = 'jiraOps.settingsChanged';

export interface WebviewReadyMessage {
  readonly type: typeof WEBVIEW_READY_MESSAGE_TYPE;
}

export interface RefreshDashboardMessage {
  readonly type: typeof REFRESH_DASHBOARD_MESSAGE_TYPE;
}

export interface OpenIssueDetailMessage {
  readonly type: typeof OPEN_ISSUE_DETAIL_MESSAGE_TYPE;
  readonly issueKey: string;
}

export interface ConnectJiraMessage {
  readonly type: typeof CONNECT_JIRA_MESSAGE_TYPE;
}

export interface DisconnectJiraMessage {
  readonly type: typeof DISCONNECT_JIRA_MESSAGE_TYPE;
}

export interface OpenSettingsMessage {
  readonly type: typeof OPEN_SETTINGS_MESSAGE_TYPE;
}

export interface OpenNotificationsMessage {
  readonly type: typeof OPEN_NOTIFICATIONS_MESSAGE_TYPE;
}

export interface OpenExternalLinkMessage {
  readonly type: typeof OPEN_EXTERNAL_LINK_MESSAGE_TYPE;
  readonly url: string;
}

export interface UpdateSettingsMessage {
  readonly notificationsEnabled: boolean;
  readonly pollIntervalMinutes: number;
  readonly type: typeof UPDATE_SETTINGS_MESSAGE_TYPE;
}

export interface ClearNotificationsMessage {
  readonly type: typeof CLEAR_NOTIFICATIONS_MESSAGE_TYPE;
}

export interface TransitionIssueMessage {
  readonly issueKey: string;
  readonly transitionId: string;
  readonly type: typeof TRANSITION_ISSUE_MESSAGE_TYPE;
}

export interface LogWorkMessage {
  readonly comment: string;
  readonly issueKey: string;
  readonly minutes: number;
  readonly type: typeof LOG_WORK_MESSAGE_TYPE;
}

export type WebviewInboundMessage =
  | WebviewReadyMessage
  | RefreshDashboardMessage
  | OpenIssueDetailMessage
  | ConnectJiraMessage
  | DisconnectJiraMessage
  | OpenSettingsMessage
  | OpenNotificationsMessage
  | OpenExternalLinkMessage
  | UpdateSettingsMessage
  | ClearNotificationsMessage
  | TransitionIssueMessage
  | LogWorkMessage;

export function isWebviewReadyMessage(
  message: unknown
): message is WebviewReadyMessage {
  return hasMessageType(message, WEBVIEW_READY_MESSAGE_TYPE);
}

export function isRefreshDashboardMessage(
  message: unknown
): message is RefreshDashboardMessage {
  return hasMessageType(message, REFRESH_DASHBOARD_MESSAGE_TYPE);
}

export function isOpenIssueDetailMessage(
  message: unknown
): message is OpenIssueDetailMessage {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message['type'] === OPEN_ISSUE_DETAIL_MESSAGE_TYPE &&
    typeof message['issueKey'] === 'string'
  );
}

export function isConnectJiraMessage(
  message: unknown
): message is ConnectJiraMessage {
  return hasMessageType(message, CONNECT_JIRA_MESSAGE_TYPE);
}

export function isDisconnectJiraMessage(
  message: unknown
): message is DisconnectJiraMessage {
  return hasMessageType(message, DISCONNECT_JIRA_MESSAGE_TYPE);
}

export function isOpenSettingsMessage(
  message: unknown
): message is OpenSettingsMessage {
  return hasMessageType(message, OPEN_SETTINGS_MESSAGE_TYPE);
}

export function isOpenNotificationsMessage(
  message: unknown
): message is OpenNotificationsMessage {
  return hasMessageType(message, OPEN_NOTIFICATIONS_MESSAGE_TYPE);
}

export function isOpenExternalLinkMessage(
  message: unknown
): message is OpenExternalLinkMessage {
  if (!isRecord(message) || message['type'] !== OPEN_EXTERNAL_LINK_MESSAGE_TYPE) {
    return false;
  }

  const url = message['url'];
  return typeof url === 'string' && isWebUrl(url);
}

export function isUpdateSettingsMessage(
  message: unknown
): message is UpdateSettingsMessage {
  if (!isRecord(message) || message['type'] !== UPDATE_SETTINGS_MESSAGE_TYPE) {
    return false;
  }

  const notificationsEnabled = message['notificationsEnabled'];
  const pollIntervalMinutes = message['pollIntervalMinutes'];
  return (
    typeof notificationsEnabled === 'boolean' &&
    typeof pollIntervalMinutes === 'number' &&
    Number.isInteger(pollIntervalMinutes) &&
    pollIntervalMinutes >= 1 &&
    pollIntervalMinutes <= 60
  );
}

export function isClearNotificationsMessage(
  message: unknown
): message is ClearNotificationsMessage {
  return hasMessageType(message, CLEAR_NOTIFICATIONS_MESSAGE_TYPE);
}

export function isTransitionIssueMessage(
  message: unknown
): message is TransitionIssueMessage {
  if (!isRecord(message) || message['type'] !== TRANSITION_ISSUE_MESSAGE_TYPE) {
    return false;
  }

  return isNonEmptyString(message['issueKey']) && isNonEmptyString(message['transitionId']);
}

export function isLogWorkMessage(message: unknown): message is LogWorkMessage {
  if (!isRecord(message) || message['type'] !== LOG_WORK_MESSAGE_TYPE) {
    return false;
  }

  return (
    isNonEmptyString(message['issueKey']) &&
    typeof message['comment'] === 'string' &&
    isSupportedWorkMinutes(message['minutes'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasMessageType(value: unknown, type: string): value is Record<string, unknown> {
  return isRecord(value) && value['type'] === type;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSupportedWorkMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1440;
}

function isWebUrl(value: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    return false;
  }

  return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
}
