import { describe, expect, test } from 'vitest';

import { isJiraOpsTestMode, resolveTestRemoteLinks } from './testModeData';

describe('testModeData', () => {
  test('returns deterministic remote web links for an issue key', () => {
    expect(resolveTestRemoteLinks('OPS-123')).toEqual([
      {
        id: 'OPS-123-design-review',
        title: 'Design Review',
        url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/1453/design-review',
        relationship: 'Confluence',
        host: 'example.atlassian.net',
      },
      {
        id: 'OPS-123-service-runbook',
        title: 'Service Runbook',
        url: 'https://docs.example.com/runbooks/payment-service',
        relationship: 'Runbook',
        host: 'docs.example.com',
      },
      {
        id: 'OPS-123-release-note',
        title: 'Release Note',
        url: 'https://github.com/example/platform/releases/tag/2026.04.29',
        relationship: 'Release',
        host: 'github.com',
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
