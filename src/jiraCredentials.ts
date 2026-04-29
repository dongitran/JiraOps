import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const JIRA_CLIENT_ID_SECRET_KEY = 'jira-ops.oauth.clientId';
export const JIRA_CLIENT_SECRET_SECRET_KEY = 'jira-ops.oauth.clientSecret';

const JIRA_CLIENT_ID_ENV_KEY = 'JIRA_CLIENT_ID';
const JIRA_CLIENT_SECRET_ENV_KEY = 'JIRA_CLIENT_SECRET';
const SHELL_ENV_KEY = 'SHELL';

export interface SecretStorageLike {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export type JiraCredentialSource = 'env' | 'keychain' | 'none';

export interface JiraOAuthCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly source: JiraCredentialSource;
}

export interface JiraCredentialInputOptions {
  readonly title: string;
  readonly prompt: string;
  readonly placeHolder?: string;
  readonly password?: boolean;
  readonly ignoreFocusOut: boolean;
  readonly validateInput?: (value: string) => string | undefined;
}

export interface JiraCredentialPrompt {
  readonly showInputBox: (
    options: JiraCredentialInputOptions
  ) => PromiseLike<string | undefined>;
}

export class JiraCredentialSetupCanceledError extends Error {
  public constructor() {
    super('Jira OAuth credential setup was canceled.');
    this.name = 'JiraCredentialSetupCanceledError';
  }
}

let cachedShellEnv: NodeJS.ProcessEnv | null = null;
let secretStorage: SecretStorageLike | undefined;
let appliedKeychainClientId: string | null = null;
let appliedKeychainClientSecret: string | null = null;

export function setJiraSecretStorage(storage: SecretStorageLike | undefined): void {
  secretStorage = storage;
}

export function clearJiraShellEnvCache(): void {
  cachedShellEnv = null;
}

export async function getJiraOAuthCredentials(): Promise<JiraOAuthCredentials> {
  const processCredentials = readCredentialPairFromEnv(process.env);
  if (processCredentials !== null) {
    return toCredentials(processCredentials, 'env');
  }

  const shellCredentials = readCredentialPairFromEnv(await readLoginShellEnv());
  if (shellCredentials !== null) {
    return toCredentials(shellCredentials, 'env');
  }

  const storedCredentials = await readCredentialPairFromSecretStorage();
  if (storedCredentials !== null) {
    return toCredentials(storedCredentials, 'keychain');
  }

  return { clientId: '', clientSecret: '', source: 'none' };
}

export async function ensureJiraOAuthCredentials(
  prompt: JiraCredentialPrompt
): Promise<JiraOAuthCredentials> {
  const existingCredentials = await getJiraOAuthCredentials();
  if (hasCredentialPair(existingCredentials)) {
    applyJiraOAuthCredentialsToEnv(existingCredentials);
    return existingCredentials;
  }

  const clientId = await promptForCredential(prompt, {
    title: 'Jira OAuth Client ID',
    prompt: 'Enter your Atlassian OAuth app client ID.',
    placeHolder: 'JIRA_CLIENT_ID',
    requiredMessage: 'Jira OAuth client ID is required.',
  });
  const clientSecret = await promptForCredential(prompt, {
    title: 'Jira OAuth Client Secret',
    prompt: 'Enter your Atlassian OAuth app client secret.',
    placeHolder: 'JIRA_CLIENT_SECRET',
    requiredMessage: 'Jira OAuth client secret is required.',
    password: true,
  });

  await saveJiraOAuthCredentialsToSecretStorage(clientId, clientSecret);
  const storedCredentials = toCredentials({ clientId, clientSecret }, 'keychain');
  applyJiraOAuthCredentialsToEnv(storedCredentials);
  return storedCredentials;
}

export async function saveJiraOAuthCredentialsToSecretStorage(
  clientId: string,
  clientSecret: string
): Promise<void> {
  if (secretStorage === undefined) {
    throw new Error('Jira OAuth credential storage is not available.');
  }

  const credentials = normalizeCredentialPair(clientId, clientSecret);
  await secretStorage.store(JIRA_CLIENT_ID_SECRET_KEY, credentials.clientId);
  await secretStorage.store(JIRA_CLIENT_SECRET_SECRET_KEY, credentials.clientSecret);
  cachedShellEnv = null;
}

export async function clearJiraOAuthCredentialsFromSecretStorage(): Promise<void> {
  if (secretStorage === undefined) {
    return;
  }

  await secretStorage.delete(JIRA_CLIENT_ID_SECRET_KEY);
  await secretStorage.delete(JIRA_CLIENT_SECRET_SECRET_KEY);
  cachedShellEnv = null;
  clearAppliedKeychainEnv();
}

export function applyJiraOAuthCredentialsToEnv(
  credentials: JiraOAuthCredentials
): void {
  if (!hasCredentialPair(credentials)) {
    return;
  }

  process.env[JIRA_CLIENT_ID_ENV_KEY] = credentials.clientId;
  process.env[JIRA_CLIENT_SECRET_ENV_KEY] = credentials.clientSecret;
  if (credentials.source === 'keychain') {
    appliedKeychainClientId = credentials.clientId;
    appliedKeychainClientSecret = credentials.clientSecret;
  }
}

async function readLoginShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (process.platform === 'win32') {
    return {};
  }
  if (cachedShellEnv !== null) {
    return cachedShellEnv;
  }

  const shell = process.env[SHELL_ENV_KEY] ?? '/bin/zsh';
  const args = shell.endsWith('fish') ? ['-l', '-c', 'env'] : ['-l', '-i', '-c', 'env'];
  try {
    const { stdout } = await execFileAsync(shell, args, { timeout: 10_000 });
    cachedShellEnv = parseShellEnv(stdout);
    return cachedShellEnv;
  } catch {
    cachedShellEnv = {};
    return cachedShellEnv;
  }
}

async function readCredentialPairFromSecretStorage(): Promise<CredentialPair | null> {
  if (secretStorage === undefined) {
    return null;
  }

  const clientId = await secretStorage.get(JIRA_CLIENT_ID_SECRET_KEY);
  const clientSecret = await secretStorage.get(JIRA_CLIENT_SECRET_SECRET_KEY);
  return readCredentialPair(clientId, clientSecret);
}

function readCredentialPairFromEnv(env: NodeJS.ProcessEnv): CredentialPair | null {
  return readCredentialPair(
    env[JIRA_CLIENT_ID_ENV_KEY],
    env[JIRA_CLIENT_SECRET_ENV_KEY]
  );
}

function readCredentialPair(
  clientId: string | undefined,
  clientSecret: string | undefined
): CredentialPair | null {
  const normalizedClientId = normalizeCredentialValue(clientId);
  const normalizedClientSecret = normalizeCredentialValue(clientSecret);
  if (normalizedClientId.length === 0 || normalizedClientSecret.length === 0) {
    return null;
  }

  return {
    clientId: normalizedClientId,
    clientSecret: normalizedClientSecret,
  };
}

function normalizeCredentialPair(clientId: string, clientSecret: string): CredentialPair {
  const credentials = readCredentialPair(clientId, clientSecret);
  if (credentials === null) {
    throw new Error('Jira OAuth client ID and client secret are required.');
  }

  return credentials;
}

function normalizeCredentialValue(value: string | undefined): string {
  return value === undefined ? '' : value.trim();
}

function toCredentials(
  pair: CredentialPair,
  source: Exclude<JiraCredentialSource, 'none'>
): JiraOAuthCredentials {
  return {
    clientId: pair.clientId,
    clientSecret: pair.clientSecret,
    source,
  };
}

function hasCredentialPair(credentials: JiraOAuthCredentials): boolean {
  return credentials.clientId.length > 0 && credentials.clientSecret.length > 0;
}

function parseShellEnv(stdout: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};
  for (const line of stdout.split('\n')) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex > 0) {
      parsed[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
    }
  }

  return parsed;
}

async function promptForCredential(
  prompt: JiraCredentialPrompt,
  options: PromptOptions
): Promise<string> {
  const value = await prompt.showInputBox(buildInputOptions(options));
  if (value === undefined) {
    throw new JiraCredentialSetupCanceledError();
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new Error(options.requiredMessage);
  }

  return normalizedValue;
}

function buildInputOptions(options: PromptOptions): JiraCredentialInputOptions {
  const inputOptions: JiraCredentialInputOptions = {
    title: options.title,
    prompt: options.prompt,
    placeHolder: options.placeHolder,
    ignoreFocusOut: true,
    validateInput: (value: string) => {
      return value.trim().length === 0 ? options.requiredMessage : undefined;
    },
  };

  if (options.password === true) {
    return { ...inputOptions, password: true };
  }

  return inputOptions;
}

function clearAppliedKeychainEnv(): void {
  if (process.env[JIRA_CLIENT_ID_ENV_KEY] === appliedKeychainClientId) {
    Reflect.deleteProperty(process.env, JIRA_CLIENT_ID_ENV_KEY);
  }
  if (process.env[JIRA_CLIENT_SECRET_ENV_KEY] === appliedKeychainClientSecret) {
    Reflect.deleteProperty(process.env, JIRA_CLIENT_SECRET_ENV_KEY);
  }

  appliedKeychainClientId = null;
  appliedKeychainClientSecret = null;
}

interface CredentialPair {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface PromptOptions {
  readonly title: string;
  readonly prompt: string;
  readonly placeHolder: string;
  readonly requiredMessage: string;
  readonly password?: boolean;
}
