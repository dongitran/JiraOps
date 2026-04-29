import type { RemoteWebLink } from './remoteLinks';

export function resolveTestRemoteLinks(issueKey: string): RemoteWebLink[] {
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
