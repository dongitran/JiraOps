import { describe, expect, test, vi } from 'vitest';

import {
  buildJiraRemoteLinksUrl,
  fetchJiraRemoteLinks,
  isTokenUsable,
  OAuthJiraTokenProvider,
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
