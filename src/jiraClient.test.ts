import { describe, expect, test, vi } from 'vitest';

import {
  addJiraIssueWorklog,
  buildAssignedIssuesSearchBody,
  buildAssignedIssuesSearchUrl,
  buildJiraIssueTransitionsUrl,
  buildJiraIssueWorklogUrl,
  buildJiraRemoteLinksUrl,
  fetchAssignedJiraIssues,
  fetchJiraIssueTransitions,
  fetchJiraRemoteLinks,
  isTokenUsable,
  OAuthJiraTokenProvider,
  transitionJiraIssue,
  type JiraOAuthClientLike,
  type JiraTokens,
} from './jiraClient';

function createTokens(overrides: Partial<JiraTokens> = {}): JiraTokens {
  return {
    accessToken: 'sample-access-value',
    refreshToken: 'sample-refresh-value',
    expiresIn: 3600,
    scope: 'read:jira-work',
    tokenType: 'Bearer',
    cloudId: 'cloud-123',
    cloudName: 'Example Jira',
    issuedAt: 1_000,
    ...overrides,
  };
}

describe('jiraClient', () => {
  test('builds the Jira remote links API URL safely', () => {
    expect(buildJiraRemoteLinksUrl('cloud-123', 'OPS-123')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123/remotelink'
    );
  });

  test('builds the assigned issues enhanced search request safely', () => {
    expect(buildAssignedIssuesSearchUrl('cloud-123')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/search/jql'
    );
    expect(buildAssignedIssuesSearchBody()).toEqual({
      jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
      fields: ['summary', 'status', 'priority', 'assignee', 'updated'],
      maxResults: 25,
    });
  });

  test('builds Jira issue action URLs safely', () => {
    expect(buildJiraIssueTransitionsUrl('cloud-123', 'OPS-123')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123/transitions'
    );
    expect(buildJiraIssueWorklogUrl('cloud-123', 'OPS-123')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123/worklog'
    );
  });

  test('detects usable stored tokens with a refresh safety window', () => {
    const tokens = createTokens({ issuedAt: 1_000, expiresIn: 120 });

    expect(isTokenUsable(tokens, 30_000)).toBe(true);
    expect(isTokenUsable(tokens, 70_000)).toBe(false);
  });

  test('fetches and parses Jira remote links without exposing credentials', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: 10001,
              relationship: 'Runbook',
              object: {
                title: 'Service Runbook',
                url: 'https://docs.example.com/runbook',
              },
            },
          ]),
          { status: 200 }
        )
      );
    });

    const result = await fetchJiraRemoteLinks({
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      issueKey: 'OPS-123',
      fetchImpl: fetchMock,
    });

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123/remotelink',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer sample-access-value',
        },
      }
    );
  });

  test('throws a neutral error when Jira returns an unsuccessful response', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response('service detail', { status: 403, statusText: 'Forbidden' })
      );
    });

    await expect(
      fetchJiraRemoteLinks({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-123',
        fetchImpl: fetchMock,
      })
    ).rejects.toThrow('Jira remote links could not be loaded.');
  });

  test('fetches and parses assigned Jira issues from enhanced search', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            issues: [
              {
                key: 'OPS-123',
                fields: {
                  summary: 'Stabilize payment reconciliation alerts',
                  status: {
                    name: 'In Progress',
                    statusCategory: {
                      name: 'In Progress',
                    },
                  },
                  priority: {
                    name: 'High',
                  },
                  assignee: {
                    displayName: 'Current User',
                  },
                  updated: '2026-05-01T08:20:00.000+0000',
                },
              },
            ],
          }),
          { status: 200 }
        )
      );
    });

    const result = await fetchAssignedJiraIssues({
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      fetchImpl: fetchMock,
    });

    expect(result).toEqual([
      {
        key: 'OPS-123',
        summary: 'Stabilize payment reconciliation alerts',
        status: 'In Progress',
        statusCategory: 'In Progress',
        priority: 'High',
        assigneeDisplayName: 'Current User',
        updated: '2026-05-01T08:20:00.000+0000',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/search/jql',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer sample-access-value',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildAssignedIssuesSearchBody()),
      }
    );
  });

  test('throws a neutral error when assigned issue search fails', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(new Response('denied', { status: 403 }));
    });

    await expect(
      fetchAssignedJiraIssues({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        fetchImpl: fetchMock,
      })
    ).rejects.toThrow('Assigned Jira issues could not be loaded.');
  });

  test('fetches available Jira issue transitions', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            transitions: [
              {
                id: '31',
                name: 'Send to Review',
                to: { name: 'Code Review' },
              },
            ],
          }),
          { status: 200 }
        )
      );
    });

    await expect(
      fetchJiraIssueTransitions({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-123',
        fetchImpl: fetchMock,
      })
    ).resolves.toEqual([
      {
        id: '31',
        name: 'Send to Review',
        toStatus: 'Code Review',
      },
    ]);
  });

  test('transitions a Jira issue with a neutral request body', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(new Response(null, { status: 204 }));
    });

    await expect(
      transitionJiraIssue({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-123',
        transitionId: '31',
        fetchImpl: fetchMock,
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123/transitions',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer sample-access-value',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transition: { id: '31' } }),
      }
    );
  });

  test('adds a Jira issue work log without leaking note content to logs', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(new Response(JSON.stringify({ id: '10001' }), { status: 201 }));
    });

    await expect(
      addJiraIssueWorklog({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        comment: 'Reviewed retry budget.',
        issueKey: 'OPS-123',
        minutes: 45,
        started: '2026-05-01T08:20:00.000+0000',
        fetchImpl: fetchMock,
      })
    ).resolves.toBeUndefined();
    const request = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(typeof request.body).toBe('string');
    const body = typeof request.body === 'string' ? request.body : '{}';
    expect(JSON.parse(body)).toEqual({
      comment: {
        content: [
          {
            content: [{ text: 'Reviewed retry budget.', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
        version: 1,
      },
      started: '2026-05-01T08:20:00.000+0000',
      timeSpentSeconds: 2700,
    });
  });

  test('returns usable stored tokens without authentication', async () => {
    const tokens = createTokens({ issuedAt: Date.now(), expiresIn: 3600 });
    const client = {
      getStoredTokens: vi.fn(() => tokens),
      refresh: vi.fn(),
      authenticate: vi.fn(),
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.getTokens()).resolves.toBe(tokens);
    expect(client.refresh).not.toHaveBeenCalled();
    expect(client.authenticate).not.toHaveBeenCalled();
  });

  test('refreshes expired stored tokens when a refresh token exists', async () => {
    const expiredTokens = createTokens({ issuedAt: 1_000, expiresIn: 1 });
    const refreshedTokens = createTokens({ accessToken: 'fresh-token' });
    const client = {
      getStoredTokens: vi.fn(() => expiredTokens),
      refresh: vi.fn(() => Promise.resolve(refreshedTokens)),
      authenticate: vi.fn(),
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.getTokens()).resolves.toBe(refreshedTokens);
    expect(client.refresh).toHaveBeenCalledWith('sample-refresh-value');
    expect(client.authenticate).not.toHaveBeenCalled();
  });

  test('authenticates when no stored tokens exist', async () => {
    const authenticatedTokens = createTokens({ accessToken: 'new-token' });
    const client = {
      getStoredTokens: vi.fn(() => null),
      refresh: vi.fn(),
      authenticate: vi.fn(() => Promise.resolve(authenticatedTokens)),
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.getTokens()).resolves.toBe(authenticatedTokens);
    expect(client.refresh).not.toHaveBeenCalled();
    expect(client.authenticate).toHaveBeenCalled();
  });

  test('reports a connected Jira status from stored tokens', async () => {
    const tokens = createTokens({ cloudName: 'Example Jira' });
    const client = {
      getStoredTokens: vi.fn(() => tokens),
      refresh: vi.fn(),
      authenticate: vi.fn(),
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.getConnectionStatus()).resolves.toEqual({
      connected: true,
      cloudName: 'Example Jira',
    });
  });

  test('reports a disconnected Jira status without stored tokens', async () => {
    const client = {
      getStoredTokens: vi.fn(() => null),
      refresh: vi.fn(),
      authenticate: vi.fn(),
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.getConnectionStatus()).resolves.toEqual({
      connected: false,
      cloudName: null,
    });
  });

  test('connects Jira explicitly through the OAuth flow when no tokens exist', async () => {
    const authenticatedTokens = createTokens({ cloudName: 'Example Jira' });
    const client = {
      getStoredTokens: vi.fn(() => null),
      refresh: vi.fn(),
      authenticate: vi.fn(() => Promise.resolve(authenticatedTokens)),
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.connect()).resolves.toEqual({
      connected: true,
      cloudName: 'Example Jira',
    });
    expect(client.authenticate).toHaveBeenCalled();
  });

  test('loads stored or refreshed tokens without starting browser authentication', async () => {
    const expiredTokens = createTokens({ issuedAt: 1_000, expiresIn: 1 });
    const refreshedTokens = createTokens({ accessToken: 'fresh-token' });
    const client = {
      getStoredTokens: vi.fn(() => expiredTokens),
      refresh: vi.fn(() => Promise.resolve(refreshedTokens)),
      authenticate: vi.fn(),
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.getStoredOrRefreshTokens()).resolves.toBe(refreshedTokens);
    expect(client.refresh).toHaveBeenCalledWith('sample-refresh-value');
    expect(client.authenticate).not.toHaveBeenCalled();
  });

  test('does not authenticate implicitly when no stored tokens exist', async () => {
    const client = {
      getStoredTokens: vi.fn(() => null),
      refresh: vi.fn(),
      authenticate: vi.fn(),
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.getStoredOrRefreshTokens()).resolves.toBeNull();
    expect(client.authenticate).not.toHaveBeenCalled();
  });

  test('disconnects Jira through a client-provided token clearing method', async () => {
    const clearStoredTokens = vi.fn(() => Promise.resolve());
    const client = {
      getStoredTokens: vi.fn(() => createTokens()),
      refresh: vi.fn(),
      authenticate: vi.fn(),
      clearStoredTokens,
    } satisfies JiraOAuthClientLike;
    const provider = new OAuthJiraTokenProvider(client);

    await expect(provider.disconnect()).resolves.toEqual({
      connected: false,
      cloudName: null,
    });
    expect(clearStoredTokens).toHaveBeenCalled();
  });
});
