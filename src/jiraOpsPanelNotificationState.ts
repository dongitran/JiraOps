import type { Memento, OutputChannel } from 'vscode';

import type { JiraAssignedIssue } from './jiraClient';
import {
  buildIssueUpdateBaseline,
  readJiraOpsNotificationState,
  writeJiraOpsNotificationState,
  type IssueUpdateBaseline,
  type JiraOpsNotification,
  type JiraOpsNotificationState,
} from './jiraNotifications';
import type { NotificationPoller } from './notificationPoller';

export function restorePanelNotificationState(
  memento: Memento,
  poller: NotificationPoller,
  outputChannel: OutputChannel
): JiraOpsNotificationState {
  const state = readJiraOpsNotificationState(memento);
  poller.restore(state);
  outputChannel.appendLine(
    `Restored ${String(state.notifications.length)} JiraOps notification item(s).`
  );
  return state;
}

export function recordPanelNotificationBaseline(
  memento: Memento,
  poller: NotificationPoller,
  notifications: readonly JiraOpsNotification[],
  issues: readonly JiraAssignedIssue[]
): IssueUpdateBaseline {
  const baseline = buildIssueUpdateBaseline(issues);
  poller.restore({ baseline, notifications });
  persistPanelNotificationState(memento, baseline, notifications);
  return baseline;
}

export function ensurePanelNotificationBaseline(
  memento: Memento,
  poller: NotificationPoller,
  baseline: IssueUpdateBaseline,
  notifications: readonly JiraOpsNotification[],
  issues: readonly JiraAssignedIssue[]
): IssueUpdateBaseline {
  if (Object.keys(baseline).length === 0) {
    return recordPanelNotificationBaseline(memento, poller, notifications, issues);
  }

  poller.restore({ baseline, notifications });
  return baseline;
}

export function persistPanelNotificationState(
  memento: Memento,
  baseline: IssueUpdateBaseline,
  notifications: readonly JiraOpsNotification[]
): void {
  void writeJiraOpsNotificationState(memento, { baseline, notifications });
}
