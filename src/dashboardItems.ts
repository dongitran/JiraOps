import type { JiraAssignedIssue } from './jiraClient';
import type { JiraLinkedCloneIssue } from './jiraIssueDetails';
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
  readonly cloneMergeRequests: readonly CloneMergeRequestLink[];
  readonly linkedCloneIssues: readonly JiraLinkedCloneIssue[];
  readonly webLinks: readonly RemoteWebLink[];
}

export interface CloneWebLinks {
  readonly issueKey: string;
  readonly relationship: string;
  readonly webLinks: readonly RemoteWebLink[];
}

export interface CreateDashboardIssueOptions {
  readonly linkedCloneIssues?: readonly JiraLinkedCloneIssue[];
  readonly cloneWebLinks?: readonly CloneWebLinks[];
}

export type CloneMergeRequestLink = MergeRequestLink & {
  readonly issueKey: string;
  readonly relationship: string;
};

export function createDashboardIssue(
  issue: JiraAssignedIssue,
  webLinks: readonly RemoteWebLink[],
  options: CreateDashboardIssueOptions = {}
): DashboardIssue {
  return {
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    statusCategory: issue.statusCategory,
    priority: issue.priority ?? 'No priority',
    updated: issue.updated,
    mergeRequests: extractGitLabMergeRequests(webLinks),
    cloneMergeRequests: extractCloneMergeRequests(options.cloneWebLinks ?? []),
    linkedCloneIssues: options.linkedCloneIssues ?? [],
    webLinks,
  };
}

export function countIssueMergeRequests(
  issues: readonly DashboardIssue[]
): number {
  return issues.reduce((count, issue) => {
    return count + issue.mergeRequests.length + issue.cloneMergeRequests.length;
  }, 0);
}

function extractCloneMergeRequests(
  cloneWebLinks: readonly CloneWebLinks[]
): CloneMergeRequestLink[] {
  return cloneWebLinks.filter(isCloneRelationship).flatMap((cloneLinks) => {
    return extractGitLabMergeRequests(cloneLinks.webLinks).map((mergeRequest) => {
      return {
        ...mergeRequest,
        issueKey: cloneLinks.issueKey,
        relationship: cloneLinks.relationship,
      };
    });
  });
}

function isCloneRelationship(cloneLinks: CloneWebLinks): boolean {
  return cloneLinks.relationship.trim().toLowerCase() === 'clones';
}
