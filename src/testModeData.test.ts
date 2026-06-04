import { describe, expect, test } from 'vitest';

import {
  isJiraOpsTestMode,
  resolveTestAssignedIssues,
  resolveTestIssueLatestChangelog,
  resolveTestIssueDetail,
  resolveTestIssueTransitionsAfterTransition,
  resolveTestRemoteLinks,
} from './testModeData';

describe('testModeData', () => {
  test('returns deterministic assigned Jira issues', () => {
    expect(resolveTestAssignedIssues()).toEqual([
      {
        key: 'OPS-123',
        issueType: 'Bug',
        summary: 'Stabilize payment reconciliation alerts',
        status: 'In Progress',
        statusCategory: 'In Progress',
        priority: 'High',
        assigneeDisplayName: 'Current User',
        reporterDisplayName: 'Priya Sharma',
        updated: '2026-05-01T08:20:00.000+0000',
        timeSpentSeconds: 12_600,
      },
      {
        key: 'OPS-456',
        issueType: 'Task',
        summary: 'Review checkout service release readiness',
        status: 'Code Review',
        statusCategory: 'In Progress',
        priority: 'Medium',
        assigneeDisplayName: 'Current User',
        reporterDisplayName: 'Marco Diaz',
        updated: '2026-05-01T06:05:00.000+0000',
        timeSpentSeconds: 3_600,
      },
      {
        key: 'OPS-321',
        issueType: 'Task',
        summary: 'Follow cloned inventory reservation cleanup',
        status: 'In Review',
        statusCategory: 'In Progress',
        priority: 'High',
        assigneeDisplayName: 'Current User',
        reporterDisplayName: 'Aiko Tanaka',
        updated: '2026-05-01T05:15:00.000+0000',
        timeSpentSeconds: 95_400,
      },
      {
        key: 'OPS-900',
        issueType: 'Task',
        summary: 'demoABCDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
        status: 'To Do',
        statusCategory: 'To Do',
        priority: 'Medium',
        assigneeDisplayName: 'Current User',
        reporterDisplayName: 'Liam O\'Brien',
        updated: '2026-05-01T04:45:00.000+0000',
        timeSpentSeconds: null,
      },
      {
        key: 'OPS-789',
        issueType: 'Task',
        summary: 'Confirm warehouse webhook retry policy',
        status: 'Waiting for Input',
        statusCategory: 'To Do',
        priority: 'Low',
        assigneeDisplayName: 'Current User',
        reporterDisplayName: 'Sofia Rossi',
        updated: '2026-04-30T17:45:00.000+0000',
        timeSpentSeconds: null,
      },
    ]);
  });

  test('returns deterministic latest changelog entries for notification enrichment', () => {
    expect(resolveTestIssueLatestChangelog('OPS-123')).toEqual({
      authorDisplayName: 'Current User',
      created: '2026-05-01T08:24:00.000+0000',
      items: [
        { field: 'WorklogId', fromString: null, toString: '10001' },
        { field: 'timespent', fromString: null, toString: '1800' },
      ],
    });
    expect(resolveTestIssueLatestChangelog('OPS-456')).toBeNull();
  });

  test('returns deterministic remote web links for an issue key', () => {
    expect(resolveTestRemoteLinks('OPS-123')).toEqual([
      {
        id: 'OPS-123-mr-482',
        title: 'Handle delayed payment settlements',
        url: 'https://gitlab.example.com/platform/payments/-/merge_requests/482',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: 'OPS-123-mr-483',
        title: 'Tighten reconciliation alert thresholds',
        url: 'https://gitlab.example.com/platform/observability/-/merge_requests/483',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: 'OPS-123-runbook',
        title: 'Payment incident runbook',
        url: 'https://docs.example.com/runbooks/payments/reconciliation',
        relationship: 'Runbook',
        host: 'docs.example.com',
      },
      {
        id: 'OPS-123-design',
        title: 'Alert tuning design note',
        url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/1453/alert-tuning',
        relationship: 'Confluence',
        host: 'example.atlassian.net',
      },
    ]);
  });

  test('returns deterministic remote web links for clone and fallback issue keys', () => {
    expect(resolveTestRemoteLinks('OPS-456')).toHaveLength(2);
    expect(resolveTestRemoteLinks('OPS-321')).toHaveLength(1);
    expect(resolveTestRemoteLinks('OPS-111')).toEqual([
      {
        id: 'OPS-111-mr-100',
        title: 'Merge request - TOR-45',
        url: 'https://gitlab.dongtran.com/group-a/folder/main/repository-1/-/merge_requests/100',
        relationship: 'Merge request',
        host: 'gitlab.dongtran.com',
      },
    ]);
    expect(resolveTestRemoteLinks('OPS-333')).toEqual([
      {
        id: 'OPS-333-mr-91',
        title: 'Clean stale inventory reservations',
        url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/91',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: 'OPS-333-mr-92',
        title: 'Add reservation cleanup observability',
        url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/92',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
    ]);
    expect(resolveTestRemoteLinks('OPS-789')).toHaveLength(1);
    expect(resolveTestRemoteLinks('OPS-000')).toEqual([]);
  });

  test('returns deterministic issue detail content for the detail editor', () => {
    const detail = resolveTestIssueDetail('OPS-123');

    expect(detail.descriptionText).toContain(
      'Reconciliation alerts fire too late when settlement batches arrive after the normal processing window.'
    );
    expect(detail.descriptionHtml).toContain('<p>Reconciliation alerts fire too late');
    expect(detail.descriptionHtml).toContain('data-lightbox="true"');
    expect(detail.comments[0]?.bodyHtml).toContain(
      '<p>Validated against the delayed settlement sample.'
    );
    expect(detail).toMatchObject({
      key: 'OPS-123',
      comments: [
        {
          id: 'OPS-123-comment-1',
          authorDisplayName: 'Current User',
          bodyText:
            'Validated against the delayed settlement sample. The alert should page only after the retry budget is exhausted.',
        },
      ],
      attachments: [
        {
          id: 'OPS-123-image-1',
          filename: 'reconciliation-alert-preview.png',
          mimeType: 'application/octet-stream',
        },
      ],
      linkedCloneIssues: [
        {
          key: 'OPS-111',
          relationship: 'clones',
          status: 'Code Review',
        },
      ],
    });
  });

  test('returns deterministic clone and fallback issue detail content', () => {
    expect(resolveTestIssueDetail('OPS-321')).toMatchObject({
      key: 'OPS-321',
      linkedCloneIssues: [
        {
          key: 'OPS-333',
          relationship: 'clones',
          status: 'In Review',
        },
      ],
    });
    expect(resolveTestIssueDetail('OPS-900')).toMatchObject({
      key: 'OPS-900',
      summary: 'demoABCDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      linkedCloneIssues: [],
    });
    expect(resolveTestIssueDetail('OPS-000')).toMatchObject({
      key: 'OPS-000',
      summary: 'Test issue',
    });
  });

  test('returns deterministic next issue transitions after a status change', () => {
    expect(resolveTestIssueTransitionsAfterTransition('OPS-123', '31')).toEqual([
      {
        id: '41',
        name: 'Resolve',
        toStatus: 'Done',
      },
    ]);
    expect(resolveTestIssueTransitionsAfterTransition('OPS-123', '41')).toEqual([]);
    expect(resolveTestIssueTransitionsAfterTransition('OPS-000', '31')).toEqual([]);
  });

  test('reads the JiraOps test mode flag from the environment', () => {
    const previousValue = process.env['JIRA_OPS_TEST_MODE'];

    try {
      process.env['JIRA_OPS_TEST_MODE'] = '1';
      expect(isJiraOpsTestMode()).toBe(true);

      process.env['JIRA_OPS_TEST_MODE'] = '0';
      expect(isJiraOpsTestMode()).toBe(false);
    } finally {
      if (previousValue === undefined) {
        delete process.env['JIRA_OPS_TEST_MODE'];
      } else {
        process.env['JIRA_OPS_TEST_MODE'] = previousValue;
      }
    }
  });
});
