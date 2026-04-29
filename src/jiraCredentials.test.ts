import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { execFileAsyncMock } = vi.hoisted(() => ({
  execFileAsyncMock: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => execFileAsyncMock,
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import {
  JIRA_CLIENT_ID_SECRET_KEY,
  JIRA_CLIENT_SECRET_SECRET_KEY,
  JiraCredentialSetupCanceledError,
  applyJiraOAuthCredentialsToEnv,
  clearJiraOAuthCredentialsFromSecretStorage,
  clearJiraShellEnvCache,
  ensureJiraOAuthCredentials,
  getJiraOAuthCredentials,
  saveJiraOAuthCredentialsToSecretStorage,
  setJiraSecretStorage,
  type JiraCredentialInputOptions,
  type SecretStorageLike,
} from './jiraCredentials';

const originalShell = process.env['SHELL'];
const originalClientId = process.env['JIRA_CLIENT_ID'];
const originalClientSecret = process.env['JIRA_CLIENT_SECRET'];

beforeEach(() => {
  execFileAsyncMock.mockReset();
  clearJiraShellEnvCache();
  setJiraSecretStorage(undefined);
  delete process.env['JIRA_CLIENT_ID'];
  delete process.env['JIRA_CLIENT_SECRET'];
  process.env['SHELL'] = '/bin/zsh';
});

afterEach(() => {
  setJiraSecretStorage(undefined);
  delete process.env['JIRA_CLIENT_ID'];
  delete process.env['JIRA_CLIENT_SECRET'];
  restoreOptionalEnv('SHELL', originalShell);
  restoreOptionalEnv('JIRA_CLIENT_ID', originalClientId);
  restoreOptionalEnv('JIRA_CLIENT_SECRET', originalClientSecret);
});

function restoreOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
    return;
  }

  process.env[key] = value;
}

function makeSecretStorage(initial: Record<string, string> = {}): SecretStorageLike {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    get: (key: string) => Promise.resolve(values.get(key)),
    store: (key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
}

function makePrompt(values: readonly (string | undefined)[]): {
  readonly calls: JiraCredentialInputOptions[];
  readonly showInputBox: (options: JiraCredentialInputOptions) => Promise<string | undefined>;
} {
  const calls: JiraCredentialInputOptions[] = [];
  let index = 0;

  return {
    calls,
    showInputBox: (options: JiraCredentialInputOptions) => {
      calls.push(options);
      const value = values[index];
      index += 1;
      return Promise.resolve(value);
    },
  };
}

describe('getJiraOAuthCredentials', () => {
  test('returns credentials from process.env before spawning a shell', async () => {
    process.env['JIRA_CLIENT_ID'] = 'env-client-id';
    process.env['JIRA_CLIENT_SECRET'] = 'env-client-secret';

    await expect(getJiraOAuthCredentials()).resolves.toEqual({
      clientId: 'env-client-id',
      clientSecret: 'env-client-secret',
      source: 'env',
    });
    expect(execFileAsyncMock).not.toHaveBeenCalled();
  });

  test('falls back to login-shell env when VS Code lacks shell variables', async () => {
    execFileAsyncMock.mockResolvedValue({
      stdout: 'HOME=/Users/example\nJIRA_CLIENT_ID=shell-client\nJIRA_CLIENT_SECRET=shell=secret\n',
    });

    await expect(getJiraOAuthCredentials()).resolves.toEqual({
      clientId: 'shell-client',
      clientSecret: 'shell=secret',
      source: 'env',
    });
    expect(execFileAsyncMock).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-l', '-i', '-c', 'env'],
      expect.objectContaining({ timeout: 10_000 })
    );
  });

  test('falls back to SecretStorage when env sources are missing', async () => {
    execFileAsyncMock.mockResolvedValue({ stdout: 'HOME=/Users/example\n' });
    setJiraSecretStorage(
      makeSecretStorage({
        [JIRA_CLIENT_ID_SECRET_KEY]: 'stored-client-id',
        [JIRA_CLIENT_SECRET_SECRET_KEY]: 'stored-client-secret',
      })
    );

    await expect(getJiraOAuthCredentials()).resolves.toEqual({
      clientId: 'stored-client-id',
      clientSecret: 'stored-client-secret',
      source: 'keychain',
    });
  });

  test('returns source none when no credentials are configured', async () => {
    execFileAsyncMock.mockResolvedValue({ stdout: 'HOME=/Users/example\n' });

    await expect(getJiraOAuthCredentials()).resolves.toEqual({
      clientId: '',
      clientSecret: '',
      source: 'none',
    });
  });
});

describe('SecretStorage persistence', () => {
  test('saves and clears Jira OAuth app credentials', async () => {
    const storage = makeSecretStorage();
    setJiraSecretStorage(storage);

    await saveJiraOAuthCredentialsToSecretStorage('stored-client-id', 'stored-secret');
    expect(await storage.get(JIRA_CLIENT_ID_SECRET_KEY)).toBe('stored-client-id');
    expect(await storage.get(JIRA_CLIENT_SECRET_SECRET_KEY)).toBe('stored-secret');

    await clearJiraOAuthCredentialsFromSecretStorage();
    expect(await storage.get(JIRA_CLIENT_ID_SECRET_KEY)).toBeUndefined();
    expect(await storage.get(JIRA_CLIENT_SECRET_SECRET_KEY)).toBeUndefined();
  });

  test('throws a neutral error when SecretStorage is unavailable for saving', async () => {
    await expect(
      saveJiraOAuthCredentialsToSecretStorage('stored-client-id', 'stored-secret')
    ).rejects.toThrow('Jira OAuth credential storage is not available.');
  });
});

describe('ensureJiraOAuthCredentials', () => {
  test('uses existing env credentials without prompting', async () => {
    process.env['JIRA_CLIENT_ID'] = 'env-client-id';
    process.env['JIRA_CLIENT_SECRET'] = 'env-client-secret';
    const prompt = makePrompt(['unused-client', 'unused-secret']);

    await expect(ensureJiraOAuthCredentials(prompt)).resolves.toEqual({
      clientId: 'env-client-id',
      clientSecret: 'env-client-secret',
      source: 'env',
    });
    expect(prompt.calls).toHaveLength(0);
  });

  test('prompts, stores, and applies credentials when none are configured', async () => {
    execFileAsyncMock.mockResolvedValue({ stdout: 'HOME=/Users/example\n' });
    const storage = makeSecretStorage();
    const prompt = makePrompt(['prompt-client-id', 'prompt-client-secret']);
    setJiraSecretStorage(storage);

    await expect(ensureJiraOAuthCredentials(prompt)).resolves.toEqual({
      clientId: 'prompt-client-id',
      clientSecret: 'prompt-client-secret',
      source: 'keychain',
    });

    expect(prompt.calls.map((call) => call.title)).toEqual([
      'Jira OAuth Client ID',
      'Jira OAuth Client Secret',
    ]);
    expect(await storage.get(JIRA_CLIENT_ID_SECRET_KEY)).toBe('prompt-client-id');
    expect(await storage.get(JIRA_CLIENT_SECRET_SECRET_KEY)).toBe('prompt-client-secret');
    expect(process.env['JIRA_CLIENT_ID']).toBe('prompt-client-id');
    expect(process.env['JIRA_CLIENT_SECRET']).toBe('prompt-client-secret');
  });

  test('returns a retryable cancellation error when setup is canceled', async () => {
    execFileAsyncMock.mockResolvedValue({ stdout: 'HOME=/Users/example\n' });
    setJiraSecretStorage(makeSecretStorage());
    const prompt = makePrompt([undefined]);

    await expect(ensureJiraOAuthCredentials(prompt)).rejects.toBeInstanceOf(
      JiraCredentialSetupCanceledError
    );
    expect(process.env['JIRA_CLIENT_ID']).toBeUndefined();
    expect(process.env['JIRA_CLIENT_SECRET']).toBeUndefined();
  });

  test('rejects blank prompt values without storing secrets', async () => {
    execFileAsyncMock.mockResolvedValue({ stdout: 'HOME=/Users/example\n' });
    const storage = makeSecretStorage();
    setJiraSecretStorage(storage);
    const prompt = makePrompt(['   ', 'unused-secret']);

    await expect(ensureJiraOAuthCredentials(prompt)).rejects.toThrow(
      'Jira OAuth client ID is required.'
    );
    expect(await storage.get(JIRA_CLIENT_ID_SECRET_KEY)).toBeUndefined();
    expect(await storage.get(JIRA_CLIENT_SECRET_SECRET_KEY)).toBeUndefined();
  });
});

describe('applyJiraOAuthCredentialsToEnv', () => {
  test('sets process env before jira-oauth-client is created', () => {
    applyJiraOAuthCredentialsToEnv({
      clientId: 'applied-client-id',
      clientSecret: 'applied-secret',
      source: 'keychain',
    });

    expect(process.env['JIRA_CLIENT_ID']).toBe('applied-client-id');
    expect(process.env['JIRA_CLIENT_SECRET']).toBe('applied-secret');
  });
});
