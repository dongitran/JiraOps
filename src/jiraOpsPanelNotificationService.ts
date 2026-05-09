import type * as vscode from 'vscode';

import {
  buildNotificationIssuesSearchBody,
  fetchJiraIssueActivityEntries,
  fetchNotificationJiraIssues,
  type JiraAssignedIssue,
  type JiraIssueActivityEntry,
  type JiraTokenProvider,
} from './jiraClient';
import { JiraConnectionRequiredError } from './jiraOpsPanelSupport';
import {
  isJiraOpsTestMode,
  resolveTestIssueActivities,
  resolveTestNotificationIssues,
  resolveTestNotificationReloadDelayMs,
} from './testModeData';

export interface JiraOpsPanelNotificationServiceOptions {
  readonly isTestModeConnected: () => boolean;
  readonly outputChannel: vscode.OutputChannel;
  readonly tokenProvider: JiraTokenProvider;
}

export class JiraOpsPanelNotificationService {
  public constructor(
    private readonly options: JiraOpsPanelNotificationServiceOptions
  ) {}

  public async loadNotificationIssues(
    maxResults?: number
  ): Promise<readonly JiraAssignedIssue[]> {
    if (isJiraOpsTestMode()) {
      if (!this.options.isTestModeConnected()) {
        throw new JiraConnectionRequiredError();
      }

      return resolveTestNotificationIssues().slice(0, maxResults);
    }

    const tokens = await this.options.tokenProvider.getStoredOrRefreshTokens();
    if (tokens === null) {
      throw new JiraConnectionRequiredError();
    }

    const searchBody = buildNotificationIssuesSearchBody(maxResults);
    this.options.outputChannel.appendLine(
      `Running Jira notification issue search with maxResults=${String(searchBody.maxResults)}, fields=${searchBody.fields.join(',')}.`
    );
    const issues = await fetchNotificationJiraIssues({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
      maxResults: searchBody.maxResults,
    });
    this.options.outputChannel.appendLine(
      `Fetched ${String(issues.length)} Jira notification candidate issue(s).`
    );
    return issues;
  }

  public async fetchIssueActivities(
    issueKey: string
  ): Promise<readonly JiraIssueActivityEntry[]> {
    if (isJiraOpsTestMode()) {
      return resolveTestIssueActivities(issueKey);
    }

    try {
      const tokens = await this.options.tokenProvider.getStoredOrRefreshTokens();
      if (tokens === null) {
        this.options.outputChannel.appendLine(
          `Skipped Jira activity fetch for ${issueKey}: Jira is not connected.`
        );
        return [];
      }

      this.options.outputChannel.appendLine(`Fetching recent Jira activity for ${issueKey}.`);
      const activities = await fetchJiraIssueActivityEntries({
        accessToken: tokens.accessToken,
        cloudId: tokens.cloudId,
        issueKey,
      });
      this.options.outputChannel.appendLine(
        `Loaded ${String(activities.length)} Jira activity item(s) for ${issueKey}.`
      );
      return activities;
    } catch {
      this.options.outputChannel.appendLine(`Jira activity fetch failed for ${issueKey}.`);
      return [];
    }
  }

  public async waitForReloadDelay(): Promise<void> {
    const delayMs = isJiraOpsTestMode() ? resolveTestNotificationReloadDelayMs() : 0;
    if (delayMs <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
