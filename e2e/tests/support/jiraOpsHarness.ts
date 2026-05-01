import fs from 'node:fs';
import path from 'node:path';

import {
  expect,
  _electron as electron,
  type ElectronApplication,
  type Frame,
  type Locator,
  type Page,
} from '@playwright/test';

import {
  getExtensionRootDir,
  getTemporaryUserDataDir,
  getTemporaryWorkspaceDir,
  resolveVscodeExecutablePath,
} from '../../src/launchVscode';

export const ACTIVITY_BAR_TITLE = 'Jira Ops';
export const DEFAULT_THEME_NAME = 'Default Dark Modern';

export interface ExtensionHostSession {
  readonly electronApp: ElectronApplication;
  readonly window: Page;
  readonly workspaceDir: string;
  readonly userDataDir: string;
}

export function toLaunchEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return env;
}

export function ensureThemeSettings(userDataDir: string, colorTheme: string): void {
  const userConfigDir = path.join(userDataDir, 'User');
  fs.mkdirSync(userConfigDir, { recursive: true });
  const settingsPath = path.join(userConfigDir, 'settings.json');
  const settings = {
    'workbench.colorTheme': colorTheme,
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

export async function launchExtensionHost(): Promise<ExtensionHostSession> {
  const extensionPath = getExtensionRootDir();
  const workspaceDir = getTemporaryWorkspaceDir();
  const userDataDir = getTemporaryUserDataDir();
  ensureThemeSettings(userDataDir, DEFAULT_THEME_NAME);

  const env = toLaunchEnv(process.env);
  env['JIRA_OPS_E2E'] = '1';
  env['JIRA_OPS_TEST_MODE'] = '1';

  const electronApp = await electron.launch({
    executablePath: resolveVscodeExecutablePath(),
    args: [
      workspaceDir,
      `--extensionDevelopmentPath=${extensionPath}`,
      `--user-data-dir=${userDataDir}`,
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
      '--new-window',
    ],
    env,
    timeout: 180_000,
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await dismissAiSignInModalIfNeeded(window);

  return {
    electronApp,
    window,
    workspaceDir,
    userDataDir,
  };
}

export async function cleanupExtensionHost(session: ExtensionHostSession): Promise<void> {
  await session.electronApp.close();
  fs.rmSync(session.workspaceDir, { recursive: true, force: true });
  fs.rmSync(session.userDataDir, { recursive: true, force: true });
}

export async function openJiraOpsView(window: Page): Promise<Frame> {
  const visibleFrame = await findJiraOpsFrame(window);
  if (visibleFrame !== undefined) {
    return visibleFrame;
  }

  const jiraOpsTab = window.getByRole('tab', {
    name: new RegExp(ACTIVITY_BAR_TITLE),
  });
  await expect(jiraOpsTab).toBeVisible({ timeout: 20_000 });
  await clickWithFallback(jiraOpsTab);

  return resolveJiraOpsFrame(window);
}

export async function resolveJiraOpsFrame(window: Page): Promise<Frame> {
  await expect
    .poll(
      async () => {
        const frame = await findJiraOpsFrame(window);
        return frame?.url() ?? '';
      },
      { timeout: 20_000 }
    )
    .toContain('vscode-webview://');

  const frame = await findJiraOpsFrame(window);
  if (frame === undefined) {
    throw new Error('JiraOps webview frame was not found.');
  }

  return frame;
}

export async function findJiraOpsFrame(window: Page): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of [...candidateFrames].reverse()) {
    const title = frame.getByRole('heading', { name: 'Jira Ops' });
    const input = frame.getByLabel('Jira issue URL or key');
    const titleVisible = await title.isVisible().catch(() => false);
    const inputVisible = await input.isVisible().catch(() => false);
    if (titleVisible && inputVisible) {
      return frame;
    }
  }

  return undefined;
}

export async function dismissAiSignInModalIfNeeded(window: Page): Promise<void> {
  const signInPrompt = window.getByText('Sign in to use AI Features');
  const appeared = await signInPrompt
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    return;
  }

  await window.keyboard.press('Escape');
  await expect(signInPrompt).toBeHidden({ timeout: 10_000 });
}

export async function clickWithFallback(locator: Locator): Promise<void> {
  try {
    await locator.click({ timeout: 10_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('intercepts pointer events')) {
      await locator.click({ force: true, timeout: 10_000 });
      return;
    }
    throw error;
  }
}
