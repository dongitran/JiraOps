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
    expect(issue.webLinks).toHaveLength(2);
    expect(countIssueMergeRequests([issue])).toBe(1);
  });
});
