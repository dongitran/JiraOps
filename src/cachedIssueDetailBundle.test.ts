import { describe, expect, test } from 'vitest';

import type { DashboardIssue } from './dashboardItems';
import { readCachedIssueDetailBundle } from './cachedIssueDetailBundle';
import type { JiraIssueDetail } from './jiraIssueDetails';
import type { RemoteWebLink } from './remoteLinks';
import { TtlCache } from './ttlCache';

function dashboardIssue(): DashboardIssue {
  return {
    cloneMergeRequests: [],
    key: 'OPS-123',
    linkedCloneIssues: [],
    mergeRequests: [],
    priority: 'High',
    reporter: 'Priya Sharma',
    status: 'In Progress',
    statusCategory: 'In Progress',
    summary: 'Stabilize payment reconciliation alerts',
    updated: '2026-05-01T08:20:00.000Z',
    timeSpentSeconds: 12_600,
    webLinks: [],
  };
}

function issueDetail(): JiraIssueDetail {
  return {
    activityHtml: '',
    attachments: [],
    comments: [],
    descriptionHtml: '<p>Ready</p>',
    descriptionText: 'Ready',
    technicalNotesHtml: '',
    key: 'OPS-123',
    linkedCloneIssues: [
      {
        key: 'OPS-111',
        relationship: 'clones',
        status: 'Code Review',
      },
    ],
    priority: 'High',
    status: 'In Progress',
    statusCategory: 'In Progress',
    summary: 'Stabilize payment reconciliation alerts',
    timeSpentSeconds: 12_600,
    transitions: [],
    updated: '2026-05-01T08:20:00.000Z',
  };
}

function mergeRequestLink(issueKey: string): RemoteWebLink {
  return {
    host: 'gitlab.example.com',
    id: `${issueKey}-mr`,
    relationship: 'Merge request',
    title: 'Merge request',
    url: `https://gitlab.example.com/platform/app/-/merge_requests/${issueKey === 'OPS-111' ? '88' : '482'}`,
  };
}

describe('cached issue detail bundle', () => {
  test('returns a detail bundle when issue detail and all remote links are hot', () => {
    const detailCache = new TtlCache<JiraIssueDetail>(10_000, () => 1_000);
    const remoteLinksCache = new TtlCache<readonly RemoteWebLink[]>(10_000, () => 1_000);
    detailCache.set('OPS-123', issueDetail());
    remoteLinksCache.set('OPS-123', [mergeRequestLink('OPS-123')]);
    remoteLinksCache.set('OPS-111', [mergeRequestLink('OPS-111')]);

    const bundle = readCachedIssueDetailBundle({
      detailCache,
      issue: dashboardIssue(),
      maxCloneIssues: 10,
      remoteLinksCache,
    });

    expect(bundle?.issue.mergeRequests).toHaveLength(1);
    expect(bundle?.issue.cloneMergeRequests).toHaveLength(1);
    expect(bundle?.detail.key).toBe('OPS-123');
  });

  test('returns null when a linked clone remote-link cache entry is missing', () => {
    const detailCache = new TtlCache<JiraIssueDetail>(10_000, () => 1_000);
    const remoteLinksCache = new TtlCache<readonly RemoteWebLink[]>(10_000, () => 1_000);
    detailCache.set('OPS-123', issueDetail());
    remoteLinksCache.set('OPS-123', [mergeRequestLink('OPS-123')]);

    expect(
      readCachedIssueDetailBundle({
        detailCache,
        issue: dashboardIssue(),
        maxCloneIssues: 10,
        remoteLinksCache,
      })
    ).toBeNull();
  });
});
