import type { JiraAssignedIssue } from './jiraClient';
import {
  extractGitLabMergeRequests,
  type MergeRequestLink,
  type RemoteWebLink,
} from './remoteLinks';

export interface DashboardIssue {
  readonly key: string;
  readonly summary: string;
  readonly status: string;
  readonly statusCategory: string;
  readonly priority: string;
  readonly updated: string;
  readonly mergeRequests: readonly MergeRequestLink[];
  readonly webLinks: readonly RemoteWebLink[];
}

export function createDashboardIssue(
  issue: JiraAssignedIssue,
  webLinks: readonly RemoteWebLink[]
): DashboardIssue {
  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    statusCategory: issue.statusCategory,
    priority: issue.priority ?? 'No priority',
    updated: issue.updated,
    mergeRequests: extractGitLabMergeRequests(webLinks),
    webLinks,
  };
}

export function countIssueMergeRequests(
  issues: readonly DashboardIssue[]
): number {
  return issues.reduce((count, issue) => count + issue.mergeRequests.length, 0);
}
