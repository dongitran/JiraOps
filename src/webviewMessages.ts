export const WEBVIEW_READY_MESSAGE_TYPE = 'jiraOps.webviewReady';
export const FETCH_LINKS_MESSAGE_TYPE = 'jiraOps.fetchLinks';
export const CONNECT_JIRA_MESSAGE_TYPE = 'jiraOps.connectJira';
export const DISCONNECT_JIRA_MESSAGE_TYPE = 'jiraOps.disconnectJira';
export const OPEN_EXTERNAL_LINK_MESSAGE_TYPE = 'jiraOps.openExternalLink';
export const LOADING_MESSAGE_TYPE = 'jiraOps.linksLoading';
export const LOADED_MESSAGE_TYPE = 'jiraOps.linksLoaded';
export const ERROR_MESSAGE_TYPE = 'jiraOps.linksError';
export const CONNECTION_LOADING_MESSAGE_TYPE = 'jiraOps.connectionLoading';
export const CONNECTION_CHANGED_MESSAGE_TYPE = 'jiraOps.connectionChanged';

export interface WebviewReadyMessage {
  readonly type: typeof WEBVIEW_READY_MESSAGE_TYPE;
}

export interface FetchLinksMessage {
  readonly type: typeof FETCH_LINKS_MESSAGE_TYPE;
  readonly issueInput: string;
}

export interface ConnectJiraMessage {
  readonly type: typeof CONNECT_JIRA_MESSAGE_TYPE;
}

export interface DisconnectJiraMessage {
  readonly type: typeof DISCONNECT_JIRA_MESSAGE_TYPE;
}

export interface OpenExternalLinkMessage {
  readonly type: typeof OPEN_EXTERNAL_LINK_MESSAGE_TYPE;
  readonly url: string;
}

export type WebviewInboundMessage =
  | WebviewReadyMessage
  | FetchLinksMessage
  | ConnectJiraMessage
  | DisconnectJiraMessage
  | OpenExternalLinkMessage;

export function isWebviewReadyMessage(
  message: unknown
): message is WebviewReadyMessage {
  return hasMessageType(message, WEBVIEW_READY_MESSAGE_TYPE);
}

export function isFetchLinksMessage(message: unknown): message is FetchLinksMessage {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message['type'] === FETCH_LINKS_MESSAGE_TYPE &&
    typeof message['issueInput'] === 'string'
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

export function isOpenExternalLinkMessage(
  message: unknown
): message is OpenExternalLinkMessage {
  if (!isRecord(message) || message['type'] !== OPEN_EXTERNAL_LINK_MESSAGE_TYPE) {
    return false;
  }

  const url = message['url'];
  return typeof url === 'string' && isWebUrl(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasMessageType(value: unknown, type: string): value is Record<string, unknown> {
  return isRecord(value) && value['type'] === type;
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
