import {
  createDashboardIssue,
  type CloneWebLinks,
  type DashboardIssue,
} from './dashboardItems';
import type { JiraIssueDetail } from './jiraIssueDetails';
import type { JiraAssignedIssue } from './jiraClient';
import type { RemoteWebLink } from './remoteLinks';
import type { TtlCacheResult } from './ttlCache';

export interface CachedIssueDetailBundle {
  readonly detail: JiraIssueDetail;
  readonly issue: DashboardIssue;
}

export interface CacheReader<T> {
  get(key: string): TtlCacheResult<T>;
}

export interface ReadCachedIssueDetailBundleOptions {
  readonly detailCache: CacheReader<JiraIssueDetail>;
  readonly issue: DashboardIssue;
  readonly maxCloneIssues: number;
  readonly remoteLinksCache: CacheReader<readonly RemoteWebLink[]>;
}

export function readCachedIssueDetailBundle(
  options: ReadCachedIssueDetailBundleOptions
): CachedIssueDetailBundle | null {
  const detailResult = options.detailCache.get(options.issue.key);
  if (detailResult.status !== 'hit') {
    return null;
  }

  const webLinks = readCachedRemoteLinks(options.remoteLinksCache, options.issue.key);
  if (webLinks === null) {
    return null;
  }

  const cloneWebLinks = readCachedCloneWebLinks(options, detailResult.value);
  if (cloneWebLinks === null) {
    return null;
  }

  return {
    detail: detailResult.value,
    issue: createDashboardIssue(toAssignedIssue(options.issue), webLinks, {
      cloneWebLinks,
      linkedCloneIssues: detailResult.value.linkedCloneIssues,
    }),
  };
}

function readCachedCloneWebLinks(
  options: ReadCachedIssueDetailBundleOptions,
  detail: JiraIssueDetail
): CloneWebLinks[] | null {
  const cloneWebLinks: CloneWebLinks[] = [];
  for (const cloneIssue of detail.linkedCloneIssues.slice(0, options.maxCloneIssues)) {
    const webLinks = readCachedRemoteLinks(options.remoteLinksCache, cloneIssue.key);
    if (webLinks === null) {
      return null;
    }

    cloneWebLinks.push({
      issueKey: cloneIssue.key,
      relationship: cloneIssue.relationship,
      webLinks,
    });
  }
  return cloneWebLinks;
}

function readCachedRemoteLinks(
  cache: CacheReader<readonly RemoteWebLink[]>,
  issueKey: string
): readonly RemoteWebLink[] | null {
  const result = cache.get(issueKey);
  return result.status === 'hit' ? result.value : null;
}

function toAssignedIssue(issue: DashboardIssue): JiraAssignedIssue {
  return {
    assigneeDisplayName: null,
    issueType: 'Issue',
    key: issue.key,
    priority: issue.priority,
    status: issue.status,
    statusCategory: issue.statusCategory,
    summary: issue.summary,
    updated: issue.updated,
  };
}
