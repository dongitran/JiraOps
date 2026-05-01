import type { JiraAssignedIssue } from './jiraClient';
import type { RemoteWebLink } from './remoteLinks';

export function resolveTestAssignedIssues(): JiraAssignedIssue[] {
  return [
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
  ];
}

export function resolveTestRemoteLinks(issueKey: string): RemoteWebLink[] {
  if (issueKey === 'OPS-123') {
    return [
      {
        id: `${issueKey}-mr-482`,
        title: 'Handle delayed payment settlements',
        url: 'https://gitlab.example.com/platform/payments/-/merge_requests/482',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: `${issueKey}-mr-483`,
        title: 'Tighten reconciliation alert thresholds',
        url: 'https://gitlab.example.com/platform/observability/-/merge_requests/483',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: `${issueKey}-runbook`,
        title: 'Payment incident runbook',
        url: 'https://docs.example.com/runbooks/payments/reconciliation',
        relationship: 'Runbook',
        host: 'docs.example.com',
      },
      {
        id: `${issueKey}-design`,
        title: 'Alert tuning design note',
        url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/1453/alert-tuning',
        relationship: 'Confluence',
        host: 'example.atlassian.net',
      },
    ];
  }

  if (issueKey === 'OPS-456') {
    return [
      {
        id: `${issueKey}-mr-214`,
        title: 'Prepare checkout release toggle cleanup',
        url: 'https://gitlab.example.com/storefront/checkout/-/merge_requests/214',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: `${issueKey}-dashboard`,
        title: 'Checkout release dashboard',
        url: 'https://grafana.example.com/d/checkout-release',
        relationship: 'Dashboard',
        host: 'grafana.example.com',
      },
    ];
  }

  if (issueKey === 'OPS-789') {
    return [
      {
        id: `${issueKey}-policy`,
        title: 'Webhook retry policy',
        url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/2209/webhook-retry-policy',
        relationship: 'Confluence',
        host: 'example.atlassian.net',
      },
    ];
  }

  return [
    {
      id: `${issueKey}-design-review`,
      title: 'Design Review',
      url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/1453/design-review',
      relationship: 'Confluence',
      host: 'example.atlassian.net',
    },
    {
      id: `${issueKey}-service-runbook`,
      title: 'Service Runbook',
      url: 'https://docs.example.com/runbooks/payment-service',
      relationship: 'Runbook',
      host: 'docs.example.com',
    },
    {
      id: `${issueKey}-release-note`,
      title: 'Release Note',
      url: 'https://github.com/example/platform/releases/tag/2026.04.29',
      relationship: 'Release',
      host: 'github.com',
    },
  ];
}

export function isJiraOpsTestMode(): boolean {
  return process.env['JIRA_OPS_TEST_MODE'] === '1';
}
