import * as vscode from 'vscode';

import {
  clearJiraOAuthCredentialsFromSecretStorage,
  setJiraSecretStorage,
} from './jiraCredentials';
import { JiraOpsPanelProvider, LINKS_VIEW_ID } from './jiraOpsPanel';
import {
  markWhatsNewSeen,
  parseLatestChangelogSection,
  readWhatsNewSeenVersion,
  renderWhatsNewHtml,
  shouldShowWhatsNew,
} from './whatsNew';

const OPEN_LINKS_VIEW_COMMAND = 'jiraOps.openLinksView';
const CONNECT_JIRA_COMMAND = 'jiraOps.connectJira';
const DISCONNECT_JIRA_COMMAND = 'jiraOps.disconnectJira';
const OPEN_SETTINGS_COMMAND = 'jiraOps.openSettings';
const CLEAR_JIRA_CREDENTIALS_COMMAND = 'jiraOps.clearJiraCredentials';
const OUTPUT_CHANNEL_NAME = 'Jira Ops';

export function activate(context: vscode.ExtensionContext): void {
  setJiraSecretStorage(context.secrets);

  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  outputChannel.appendLine('Activating JiraOps extension.');
  const panelProvider = new JiraOpsPanelProvider(
    context.extensionUri,
    outputChannel,
    context.globalState
  );

  const viewRegistration = vscode.window.registerWebviewViewProvider(
    LINKS_VIEW_ID,
    panelProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );

  const openLinksViewCommand = vscode.commands.registerCommand(
    OPEN_LINKS_VIEW_COMMAND,
    async (): Promise<void> => {
      await vscode.commands.executeCommand(`${LINKS_VIEW_ID}.focus`);
    }
  );

  const connectJiraCommand = vscode.commands.registerCommand(
    CONNECT_JIRA_COMMAND,
    async (): Promise<void> => {
      await vscode.commands.executeCommand(`${LINKS_VIEW_ID}.focus`);
      await panelProvider.connectJiraFromCommand();
    }
  );

  const disconnectJiraCommand = vscode.commands.registerCommand(
    DISCONNECT_JIRA_COMMAND,
    async (): Promise<void> => {
      await vscode.commands.executeCommand(`${LINKS_VIEW_ID}.focus`);
      await panelProvider.disconnectJiraFromCommand();
    }
  );

  const openSettingsCommand = vscode.commands.registerCommand(
    OPEN_SETTINGS_COMMAND,
    async (): Promise<void> => {
      await vscode.commands.executeCommand(`${LINKS_VIEW_ID}.focus`);
      panelProvider.openSettingsFromCommand();
    }
  );

  const clearJiraCredentialsCommand = vscode.commands.registerCommand(
    CLEAR_JIRA_CREDENTIALS_COMMAND,
    async (): Promise<void> => {
      await clearJiraOAuthCredentialsFromSecretStorage();
      await vscode.window.showInformationMessage(
        'Jira Ops: saved Jira OAuth app credentials cleared from system keychain.'
      );
    }
  );

  context.subscriptions.push(
    outputChannel,
    panelProvider,
    viewRegistration,
    openLinksViewCommand,
    connectJiraCommand,
    disconnectJiraCommand,
    openSettingsCommand,
    clearJiraCredentialsCommand
  );

  void showWhatsNewIfNeeded(context, outputChannel);
}

export function deactivate(): void {
  return undefined;
}

async function showWhatsNewIfNeeded(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const currentVersion = readExtensionVersion(context);
  const suppress = process.env['JIRA_OPS_SUPPRESS_WHATS_NEW'] === '1';
  const force = process.env['JIRA_OPS_FORCE_WHATS_NEW'] === '1';
  const seenVersion = readWhatsNewSeenVersion(context.globalState);
  if (!shouldShowWhatsNew({ currentVersion, force, seenVersion, suppress })) {
    outputChannel.appendLine(`What Is New skipped for JiraOps ${currentVersion}.`);
    return;
  }

  const changelog = await readChangelog(context, outputChannel);
  const notes = parseLatestChangelogSection(changelog);
  const panel = vscode.window.createWebviewPanel(
    'jiraOps.whatsNew',
    `JiraOps ${currentVersion}`,
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );
  panel.webview.html = renderWhatsNewHtml({
    bullets: notes.bullets,
    version: currentVersion,
  });
  await markWhatsNewSeen(context.globalState, currentVersion);
  outputChannel.appendLine(`What Is New shown for JiraOps ${currentVersion}.`);
}

async function readChangelog(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(context.extensionUri, 'CHANGELOG.md')
    );
    return Buffer.from(bytes).toString('utf8');
  } catch {
    outputChannel.appendLine('What Is New changelog could not be read.');
    return '';
  }
}

function readExtensionVersion(context: vscode.ExtensionContext): string {
  const packageJson: unknown = context.extension.packageJSON;
  if (isRecord(packageJson) && typeof packageJson['version'] === 'string') {
    return packageJson['version'];
  }

  return '0.0.0';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
