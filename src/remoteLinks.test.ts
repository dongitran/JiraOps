import { describe, expect, test } from 'vitest';

import { extractGitLabMergeRequests, parseRemoteLinksResponse } from './remoteLinks';

describe('parseRemoteLinksResponse', () => {
  test('maps valid Jira remote links to display rows', () => {
    const result = parseRemoteLinksResponse([
      {
        id: 10001,
        relationship: 'Confluence',
        object: {
          title: 'Design Review',
          url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/100/design-review',
        },
      },
      {
        id: 10002,
        relationship: 'Runbook',
        object: {
          title: 'Service Runbook',
          url: 'https://docs.example.com/runbooks/payment-service',
        },
      },
    ]);

    expect(result).toEqual([
      {
        id: '10001',
        relationship: 'Confluence',
        title: 'Design Review',
        url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/100/design-review',
        host: 'example.atlassian.net',
      },
      {
        id: '10002',
        relationship: 'Runbook',
        title: 'Service Runbook',
        url: 'https://docs.example.com/runbooks/payment-service',
        host: 'docs.example.com',
      },
    ]);
  });

  test('filters invalid and non-web remote links', () => {
    const result = parseRemoteLinksResponse([
      {
        id: 10001,
        relationship: 'Repository',
        object: {
          title: 'Repository',
          url: 'ssh://git.example.com/platform/repository',
        },
      },
      {
        id: 10002,
        object: {
          title: 'Deployment',
          url: 'https://deploy.example.com/release/42',
        },
      },
      {
        id: 10003,
        relationship: 'Invalid',
        object: {
          title: '',
          url: 'not a url',
        },
      },
    ]);

    expect(result).toEqual([
      {
        id: '10002',
        relationship: 'Web Link',
        title: 'Deployment',
        url: 'https://deploy.example.com/release/42',
        host: 'deploy.example.com',
      },
    ]);
  });

  test('uses fallback identifiers for remote links without ids', () => {
    const result = parseRemoteLinksResponse([
      {
        relationship: 'Reference',
        object: {
          title: 'Operational Reference',
          url: 'https://reference.example.com/item',
        },
      },
    ]);

    expect(result).toEqual([
      {
        id: 'remote-link-1',
        relationship: 'Reference',
        title: 'Operational Reference',
        url: 'https://reference.example.com/item',
        host: 'reference.example.com',
      },
    ]);
  });

  test('rejects a malformed Jira remote link response', () => {
    expect(() => parseRemoteLinksResponse({ links: [] })).toThrow(
      'Jira remote link response was not an array.'
    );
  });
});

describe('extractGitLabMergeRequests', () => {
  test('derives GitLab merge requests from remote web links', () => {
    const result = extractGitLabMergeRequests([
      {
        id: 'gitlab-com-mr',
        relationship: 'Merge request',
        title: 'Handle delayed payment settlements',
        url: 'https://gitlab.com/group/subgroup/payments/-/merge_requests/482',
        host: 'gitlab.com',
      },
      {
        id: 'self-hosted-mr',
        relationship: 'Merge request',
        title: 'Tighten alert thresholds',
        url: 'https://gitlab.example.com/platform/observability/-/merge_requests/483?diff_id=10',
        host: 'gitlab.example.com',
      },
    ]);

    expect(result).toEqual([
      {
        id: 'gitlab-com-mr',
        sourceLinkId: 'gitlab-com-mr',
        title: 'Handle delayed payment settlements',
        url: 'https://gitlab.com/group/subgroup/payments/-/merge_requests/482',
        host: 'gitlab.com',
        projectPath: 'group/subgroup/payments',
        iid: '482',
      },
      {
        id: 'self-hosted-mr',
        sourceLinkId: 'self-hosted-mr',
        title: 'Tighten alert thresholds',
        url: 'https://gitlab.example.com/platform/observability/-/merge_requests/483?diff_id=10',
        host: 'gitlab.example.com',
        projectPath: 'platform/observability',
        iid: '483',
      },
    ]);
  });

  test('ignores remote web links that are not GitLab merge request URLs', () => {
    const result = extractGitLabMergeRequests([
      {
        id: 'gitlab-issue',
        relationship: 'Issue',
        title: 'GitLab issue',
        url: 'https://gitlab.example.com/platform/payments/-/issues/42',
        host: 'gitlab.example.com',
      },
      {
        id: 'runbook',
        relationship: 'Runbook',
        title: 'Service Runbook',
        url: 'https://docs.example.com/runbooks/payment-service',
        host: 'docs.example.com',
      },
    ]);

    expect(result).toEqual([]);
  });
});
