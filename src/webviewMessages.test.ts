import { describe, expect, test } from 'vitest';

import {
  CONNECT_JIRA_MESSAGE_TYPE,
  DISCONNECT_JIRA_MESSAGE_TYPE,
  FETCH_LINKS_MESSAGE_TYPE,
  OPEN_SETTINGS_MESSAGE_TYPE,
  OPEN_EXTERNAL_LINK_MESSAGE_TYPE,
  WEBVIEW_READY_MESSAGE_TYPE,
  isConnectJiraMessage,
  isDisconnectJiraMessage,
  isFetchLinksMessage,
  isOpenExternalLinkMessage,
  isOpenSettingsMessage,
  isWebviewReadyMessage,
} from './webviewMessages';

describe('webview message guards', () => {
  test('accepts a webview ready message', () => {
    expect(
      isWebviewReadyMessage({
        type: WEBVIEW_READY_MESSAGE_TYPE,
      })
    ).toBe(true);
  });

  test('accepts Jira connection action messages', () => {
    expect(
      isConnectJiraMessage({
        type: CONNECT_JIRA_MESSAGE_TYPE,
      })
    ).toBe(true);
    expect(
      isDisconnectJiraMessage({
        type: DISCONNECT_JIRA_MESSAGE_TYPE,
      })
    ).toBe(true);
    expect(
      isOpenSettingsMessage({
        type: OPEN_SETTINGS_MESSAGE_TYPE,
      })
    ).toBe(true);
  });

  test('rejects malformed Jira connection action messages', () => {
    expect(isConnectJiraMessage(null)).toBe(false);
    expect(isDisconnectJiraMessage(null)).toBe(false);
    expect(isOpenSettingsMessage(null)).toBe(false);
    expect(isWebviewReadyMessage({ type: FETCH_LINKS_MESSAGE_TYPE })).toBe(false);
  });

  test('accepts a fetch links message with issue input', () => {
    expect(
      isFetchLinksMessage({
        type: FETCH_LINKS_MESSAGE_TYPE,
        issueInput: 'OPS-123',
      })
    ).toBe(true);
  });

  test('rejects malformed fetch links messages', () => {
    expect(isFetchLinksMessage(null)).toBe(false);
    expect(isFetchLinksMessage({ type: FETCH_LINKS_MESSAGE_TYPE })).toBe(false);
    expect(
      isFetchLinksMessage({
        type: FETCH_LINKS_MESSAGE_TYPE,
        issueInput: 123,
      })
    ).toBe(false);
  });

  test('accepts an external link message with an HTTPS URL', () => {
    expect(
      isOpenExternalLinkMessage({
        type: OPEN_EXTERNAL_LINK_MESSAGE_TYPE,
        url: 'https://docs.example.com/runbook',
      })
    ).toBe(true);
  });

  test('rejects external link messages for non-web URLs', () => {
    expect(isOpenExternalLinkMessage(null)).toBe(false);
    expect(
      isOpenExternalLinkMessage({
        type: OPEN_EXTERNAL_LINK_MESSAGE_TYPE,
        url: 123,
      })
    ).toBe(false);
    expect(
      isOpenExternalLinkMessage({
        type: OPEN_EXTERNAL_LINK_MESSAGE_TYPE,
        url: 'file:///tmp/local-file',
      })
    ).toBe(false);
  });
});
