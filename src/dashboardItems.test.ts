import { describe, expect, test } from 'vitest';

import { countIssueMergeRequests, createDashboardIssue } from './dashboardItems';

describe('dashboard issue mapping', () => {
  test('keeps all web links while surfacing GitLab merge requests separately', () => {
    const issue = createDashboardIssue(
      {
        key: 'OPS-123',
        summary: 'Stabilize payment reconciliation alerts',
        status: 'In Progress',
        statusCategory: 'In Progress',
        priority: 'High',
        assigneeDisplayName: 'Current User',
        updated: '2026-05-01T08:20:00.000+0000',
      },
      [
        {
          id: 'mr-482',
          title: 'Handle delayed payment settlements',
          url: 'https://gitlab.example.com/platform/payments/-/merge_requests/482',
          relationship: 'Merge request',
          host: 'gitlab.example.com',
        },
        {
          id: 'runbook',
          title: 'Payment incident runbook',
          url: 'https://docs.example.com/runbooks/payments/reconciliation',
          relationship: 'Runbook',
          host: 'docs.example.com',
        },
      ]
    );

    expect(issue.mergeRequests).toHaveLength(1);
    expect(issue.cloneMergeRequests).toHaveLength(0);
    expect(issue.webLinks).toHaveLength(2);
    expect(countIssueMergeRequests([issue])).toBe(1);
  });

  test('surfaces GitLab merge requests from cloned Jira issues', () => {
    const issue = createDashboardIssue(
      {
        key: 'OPS-321',
        summary: 'Follow cloned inventory reservation cleanup',
        status: 'In Review',
        statusCategory: 'In Progress',
        priority: 'High',
        assigneeDisplayName: 'Current User',
        updated: '2026-05-01T05:15:00.000+0000',
      },
      [],
      {
        linkedCloneIssues: [
          {
            key: 'OPS-333',
            relationship: 'clones',
            status: 'In Review',
          },
        ],
        cloneWebLinks: [
          {
            issueKey: 'OPS-333',
            relationship: 'clones',
            webLinks: [
              {
                id: 'ops-333-mr-91',
                title: 'Clean stale inventory reservations',
                url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/91',
                relationship: 'Merge request',
                host: 'gitlab.example.com',
              },
              {
                id: 'ops-333-mr-92',
                title: 'Add reservation cleanup observability',
                url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/92',
                relationship: 'Merge request',
                host: 'gitlab.example.com',
              },
            ],
          },
          {
            issueKey: 'OPS-222',
            relationship: 'is cloned by',
            webLinks: [
              {
                id: 'ops-222-mr-93',
                title: 'Incoming clone work',
                url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/93',
                relationship: 'Merge request',
                host: 'gitlab.example.com',
              },
            ],
          },
        ],
      }
    );

    expect(issue.linkedCloneIssues).toEqual([
      {
        key: 'OPS-333',
        relationship: 'clones',
        status: 'In Review',
      },
    ]);
    expect(issue.cloneMergeRequests).toEqual([
      {
        id: 'ops-333-mr-91',
        sourceLinkId: 'ops-333-mr-91',
        issueKey: 'OPS-333',
        relationship: 'clones',
        title: 'Clean stale inventory reservations',
        url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/91',
        host: 'gitlab.example.com',
        projectPath: 'storefront/inventory',
        iid: '91',
      },
      {
        id: 'ops-333-mr-92',
        sourceLinkId: 'ops-333-mr-92',
        issueKey: 'OPS-333',
        relationship: 'clones',
        title: 'Add reservation cleanup observability',
        url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/92',
        host: 'gitlab.example.com',
        projectPath: 'storefront/inventory',
        iid: '92',
      },
    ]);
    expect(countIssueMergeRequests([issue])).toBe(2);
  });
});
