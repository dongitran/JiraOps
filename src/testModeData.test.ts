import { describe, expect, test } from 'vitest';

import {
  isJiraOpsTestMode,
  resolveTestAssignedIssues,
  resolveTestIssueDetail,
  resolveTestRemoteLinks,
} from './testModeData';

describe('testModeData', () => {
  test('returns deterministic assigned Jira issues', () => {
    expect(resolveTestAssignedIssues()).toEqual([
      {
        key: 'OPS-123',
        summary: 'Stabilize payment reconciliation alerts',
        status: 'In Progress',
        statusCategory: 'In Progress',
        priority: 'High',
        assigneeDisplayName: 'Current User',
        updated: '2026-05-01T08:20:00.000+0000',
      },
      {
        key: 'OPS-456',
        summary: 'Review checkout service release readiness',
        status: 'Code Review',
        statusCategory: 'In Progress',
        priority: 'Medium',
        assigneeDisplayName: 'Current User',
        updated: '2026-05-01T06:05:00.000+0000',
      },
      {
        key: 'OPS-321',
        summary: 'Follow cloned inventory reservation cleanup',
        status: 'In Review',
        statusCategory: 'In Progress',
        priority: 'High',
        assigneeDisplayName: 'Current User',
        updated: '2026-05-01T05:15:00.000+0000',
      },
      {
        key: 'OPS-900',
        summary: 'demoABCDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
        status: 'To Do',
        statusCategory: 'To Do',
        priority: 'Medium',
        assigneeDisplayName: 'Current User',
        updated: '2026-05-01T04:45:00.000+0000',
      },
      {
        key: 'OPS-789',
        summary: 'Confirm warehouse webhook retry policy',
        status: 'Waiting for Input',
        statusCategory: 'To Do',
        priority: 'Low',
        assigneeDisplayName: 'Current User',
        updated: '2026-04-30T17:45:00.000+0000',
      },
    ]);
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
        id: 'OPS-111-mr-88',
        title: 'Backport alert window tuning',
        url: 'https://gitlab.example.com/platform/observability/-/merge_requests/88',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
    ]);
    expect(resolveTestRemoteLinks('OPS-222')).toEqual([
      {
        id: 'OPS-222-mr-91',
        title: 'Clean stale inventory reservations',
        url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/91',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: 'OPS-222-mr-92',
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
          mimeType: 'image/png',
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
          key: 'OPS-222',
          relationship: 'is cloned by',
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
