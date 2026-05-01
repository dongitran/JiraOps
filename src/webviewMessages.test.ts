import { describe, expect, test } from 'vitest';

import {
  CONNECT_JIRA_MESSAGE_TYPE,
  DISCONNECT_JIRA_MESSAGE_TYPE,
  CLEAR_NOTIFICATIONS_MESSAGE_TYPE,
  OPEN_ISSUE_DETAIL_MESSAGE_TYPE,
  OPEN_SETTINGS_MESSAGE_TYPE,
  OPEN_EXTERNAL_LINK_MESSAGE_TYPE,
  REFRESH_DASHBOARD_MESSAGE_TYPE,
  UPDATE_SETTINGS_MESSAGE_TYPE,
  WEBVIEW_READY_MESSAGE_TYPE,
  isClearNotificationsMessage,
  isConnectJiraMessage,
  isDisconnectJiraMessage,
  isOpenIssueDetailMessage,
  isOpenExternalLinkMessage,
  isOpenSettingsMessage,
  isRefreshDashboardMessage,
  isUpdateSettingsMessage,
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
    expect(isWebviewReadyMessage({ type: REFRESH_DASHBOARD_MESSAGE_TYPE })).toBe(false);
  });

  test('accepts dashboard refresh and issue detail messages', () => {
    expect(
      isRefreshDashboardMessage({
        type: REFRESH_DASHBOARD_MESSAGE_TYPE,
      })
    ).toBe(true);
    expect(
      isOpenIssueDetailMessage({
        type: OPEN_ISSUE_DETAIL_MESSAGE_TYPE,
        issueKey: 'OPS-123',
      })
    ).toBe(true);
  });

  test('rejects malformed issue detail messages', () => {
    expect(isOpenIssueDetailMessage(null)).toBe(false);
    expect(
      isOpenIssueDetailMessage({
        type: OPEN_ISSUE_DETAIL_MESSAGE_TYPE,
      })
    ).toBe(false);
    expect(
      isOpenIssueDetailMessage({
        type: OPEN_ISSUE_DETAIL_MESSAGE_TYPE,
        issueKey: 123,
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

  test('accepts notification clear and settings update messages', () => {
    expect(
      isClearNotificationsMessage({
        type: CLEAR_NOTIFICATIONS_MESSAGE_TYPE,
      })
    ).toBe(true);
    expect(
      isUpdateSettingsMessage({
        notificationsEnabled: true,
        pollIntervalMinutes: 5,
        type: UPDATE_SETTINGS_MESSAGE_TYPE,
      })
    ).toBe(true);
  });

  test('rejects malformed settings update messages', () => {
    expect(isUpdateSettingsMessage(null)).toBe(false);
    expect(
      isUpdateSettingsMessage({
        notificationsEnabled: true,
        pollIntervalMinutes: 0,
        type: UPDATE_SETTINGS_MESSAGE_TYPE,
      })
    ).toBe(false);
    expect(
      isUpdateSettingsMessage({
        notificationsEnabled: 'true',
        pollIntervalMinutes: 5,
        type: UPDATE_SETTINGS_MESSAGE_TYPE,
      })
    ).toBe(false);
  });
});
