import { describe, expect, test } from 'vitest';

import {
  isJiraOpsTestMode,
  resolveTestAssignedIssues,
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
