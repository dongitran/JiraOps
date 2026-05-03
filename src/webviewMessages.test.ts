import { describe, expect, test } from 'vitest';

import {
  CONNECT_JIRA_MESSAGE_TYPE,
  CLONE_MERGE_REQUEST_MESSAGE_TYPE,
  DISCONNECT_JIRA_MESSAGE_TYPE,
  CLEAR_NOTIFICATIONS_MESSAGE_TYPE,
  LOG_WORK_MESSAGE_TYPE,
  OPEN_ISSUE_DETAIL_MESSAGE_TYPE,
  OPEN_NOTIFICATIONS_MESSAGE_TYPE,
  OPEN_SETTINGS_MESSAGE_TYPE,
  OPEN_EXTERNAL_LINK_MESSAGE_TYPE,
  REFRESH_DASHBOARD_MESSAGE_TYPE,
  TRANSITION_ISSUE_MESSAGE_TYPE,
  UPDATE_SETTINGS_MESSAGE_TYPE,
  WEBVIEW_READY_MESSAGE_TYPE,
  isClearNotificationsMessage,
  isCloneMergeRequestMessage,
  isConnectJiraMessage,
  isDisconnectJiraMessage,
  isLogWorkMessage,
  isOpenIssueDetailMessage,
  isOpenNotificationsMessage,
  isOpenExternalLinkMessage,
  isOpenSettingsMessage,
  isRefreshDashboardMessage,
  isTransitionIssueMessage,
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
    expect(
      isOpenNotificationsMessage({
        type: OPEN_NOTIFICATIONS_MESSAGE_TYPE,
      })
    ).toBe(true);
  });

  test('rejects malformed Jira connection action messages', () => {
    expect(isConnectJiraMessage(null)).toBe(false);
    expect(isDisconnectJiraMessage(null)).toBe(false);
    expect(isOpenSettingsMessage(null)).toBe(false);
    expect(isOpenNotificationsMessage(null)).toBe(false);
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

  test('accepts valid issue detail action messages', () => {
    expect(
      isTransitionIssueMessage({
        issueKey: 'OPS-123',
        transitionId: '31',
        type: TRANSITION_ISSUE_MESSAGE_TYPE,
      })
    ).toBe(true);
    expect(
      isLogWorkMessage({
        comment: 'Reviewed retry budget.',
        issueKey: 'OPS-123',
        minutes: 45,
        type: LOG_WORK_MESSAGE_TYPE,
      })
    ).toBe(true);
    expect(
      isCloneMergeRequestMessage({
        baseBranch: 'staging',
        destinationGroup: 'group-b',
        issueKey: 'OPS-123',
        portBranch: 'cherry-pick/OPS-123',
        sourceMrTitle: 'Merge request - TOR-45',
        sourceMrUrl:
          'https://gitlab.dongtran.com/group-a/folder/main/repository-1/-/merge_requests/100',
        title: '[Clone] TOR-45 OPS-123',
        type: CLONE_MERGE_REQUEST_MESSAGE_TYPE,
      })
    ).toBe(true);
  });

  test('rejects malformed issue detail action messages', () => {
    expect(isTransitionIssueMessage(null)).toBe(false);
    expect(
      isTransitionIssueMessage({
        issueKey: 'OPS-123',
        transitionId: '',
        type: TRANSITION_ISSUE_MESSAGE_TYPE,
      })
    ).toBe(false);
    expect(
      isLogWorkMessage({
        comment: 'Too short',
        issueKey: 'OPS-123',
        minutes: 0,
        type: LOG_WORK_MESSAGE_TYPE,
      })
    ).toBe(false);
    expect(
      isLogWorkMessage({
        issueKey: 'OPS-123',
        minutes: 1,
        type: LOG_WORK_MESSAGE_TYPE,
      })
    ).toBe(false);
    expect(
      isCloneMergeRequestMessage({
        baseBranch: 'staging',
        destinationGroup: 'group-b',
        issueKey: 'OPS-123',
        portBranch: 'cherry-pick/OPS-123',
        sourceMrTitle: 'Merge request - TOR-45',
        sourceMrUrl: 'file:///tmp/repo',
        title: '[Clone] TOR-45 OPS-123',
        type: CLONE_MERGE_REQUEST_MESSAGE_TYPE,
      })
    ).toBe(false);
    expect(
      isCloneMergeRequestMessage({
        baseBranch: '',
        destinationGroup: 'group-b',
        issueKey: 'OPS-123',
        portBranch: 'cherry-pick/OPS-123',
        sourceMrTitle: 'Merge request - TOR-45',
        sourceMrUrl:
          'https://gitlab.dongtran.com/group-a/folder/main/repository-1/-/merge_requests/100',
        title: '[Clone] TOR-45 OPS-123',
        type: CLONE_MERGE_REQUEST_MESSAGE_TYPE,
      })
    ).toBe(false);
  });
});
