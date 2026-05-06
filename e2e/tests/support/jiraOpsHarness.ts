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

export const ACTIVITY_BAR_TITLE = 'JiraOps';
export const DEFAULT_THEME_NAME = 'Default Dark Modern';

export interface ExtensionHostSession {
  readonly electronApp: ElectronApplication;
  readonly window: Page;
  readonly workspaceDir: string;
  readonly userDataDir: string;
}

export interface LaunchExtensionHostOptions {
  readonly env?: Readonly<Record<string, string>>;
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

export async function launchExtensionHost(
  options: LaunchExtensionHostOptions = {}
): Promise<ExtensionHostSession> {
  const extensionPath = getExtensionRootDir();
  const workspaceDir = getTemporaryWorkspaceDir();
  const userDataDir = getTemporaryUserDataDir();
  ensureThemeSettings(userDataDir, DEFAULT_THEME_NAME);

  const env = toLaunchEnv(process.env);
  env['JIRA_OPS_E2E'] = '1';
  env['JIRA_OPS_TEST_MODE'] = '1';
  env['JIRA_OPS_DETAIL_TEST_DELAY_MS'] = '1200';
  env['JIRA_OPS_SUPPRESS_WHATS_NEW'] = '1';
  for (const [key, value] of Object.entries(options.env ?? {})) {
    env[key] = value;
  }

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
    const workspace = frame.getByLabel('JiraOps workspace');
    const assignedIssues = frame.getByLabel('Assigned Jira tickets');
    const workspaceVisible = await workspace.isVisible().catch(() => false);
    const assignedIssuesVisible = await assignedIssues.isVisible().catch(() => false);
    if (workspaceVisible && assignedIssuesVisible) {
      return frame;
    }
  }

  return undefined;
}

export async function resolveIssueDetailFrame(
  window: Page,
  issueKey: string
): Promise<Frame> {
  await expect
    .poll(
      async () => {
        const frame = await findIssueDetailFrame(window, issueKey);
        return frame?.url() ?? '';
      },
      { timeout: 20_000 }
    )
    .toContain('vscode-webview://');

  const frame = await findIssueDetailFrame(window, issueKey);
  if (frame === undefined) {
    throw new Error(`JiraOps detail frame was not found for ${issueKey}.`);
  }

  await activateIssueDetailTab(window, issueKey);
  return (await findIssueDetailFrame(window, issueKey)) ?? frame;
}

export async function resolveLoadedIssueDetailFrame(
  window: Page,
  issueKey: string
): Promise<Frame> {
  await expect
    .poll(
      async () => {
        const frame = await findLoadedIssueDetailFrame(window, issueKey);
        return frame?.url() ?? '';
      },
      { timeout: 20_000 }
    )
    .toContain('vscode-webview://');

  const frame = await findLoadedIssueDetailFrame(window, issueKey);
  if (frame === undefined) {
    throw new Error(`Loaded JiraOps detail frame was not found for ${issueKey}.`);
  }

  await activateIssueDetailTab(window, issueKey);
  return (await findLoadedIssueDetailFrame(window, issueKey)) ?? frame;
}

export async function findIssueDetailFrame(
  window: Page,
  issueKey: string
): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of [...candidateFrames].reverse()) {
    const detailRegion = frame.getByLabel(`${issueKey} details`);
    const detailVisible = await detailRegion.isVisible().catch(() => false);
    if (detailVisible) {
      return frame;
    }
  }

  return undefined;
}

export async function closeActiveEditor(window: Page, issueKey: string): Promise<void> {
  await activateIssueDetailTab(window, issueKey);
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+W' : 'Control+W');
  await expect
    .poll(
      async () => {
        return (await findIssueDetailFrame(window, issueKey)) === undefined;
      },
      { timeout: 10_000 }
    )
    .toBe(true);
}

async function activateIssueDetailTab(window: Page, issueKey: string): Promise<void> {
  const tab = window.getByRole('tab', { name: `${issueKey} Details` }).first();
  const visible = await tab.isVisible().catch(() => false);
  if (!visible) {
    return;
  }

  const selected = await tab.getAttribute('aria-selected').catch(() => null);
  if (selected === 'true') {
    return;
  }

  await clickWithFallback(tab);
}

export async function resolveWhatsNewFrame(window: Page): Promise<Frame> {
  await expect
    .poll(
      async () => {
        const frame = await findWhatsNewFrame(window);
        return frame?.url() ?? '';
      },
      { timeout: 20_000 }
    )
    .toContain('vscode-webview://');

  const frame = await findWhatsNewFrame(window);
  if (frame === undefined) {
    throw new Error('JiraOps What Is New frame was not found.');
  }
  return frame;
}

async function findWhatsNewFrame(window: Page): Promise<Frame | undefined> {
  const candidateFrames = window
    .frames()
    .filter((frame) => frame.url().includes('vscode-webview://'));

  for (const frame of [...candidateFrames].reverse()) {
    const releaseNotes = frame.getByLabel('JiraOps release notes');
    const visible = await releaseNotes.isVisible().catch(() => false);
    if (visible) {
      return frame;
    }
  }

  return undefined;
}

async function findLoadedIssueDetailFrame(
  window: Page,
  issueKey: string
): Promise<Frame | undefined> {
  const frame = await findIssueDetailFrame(window, issueKey);
  const detailContentVisible = await frame
    ?.getByLabel('Description and comments')
    .isVisible()
    .catch(() => false);
  return detailContentVisible === true ? frame : undefined;
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

export async function openSettingsFromViewTitle(window: Page): Promise<void> {
  const settingsButton = window.getByRole('button', { name: 'Open Settings' }).first();
  await expect(settingsButton).toBeVisible({ timeout: 10_000 });
  await clickWithFallback(settingsButton);
}
