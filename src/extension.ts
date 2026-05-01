import * as vscode from 'vscode';

import {
  clearJiraOAuthCredentialsFromSecretStorage,
  setJiraSecretStorage,
} from './jiraCredentials';
import { JiraOpsPanelProvider, LINKS_VIEW_ID } from './jiraOpsPanel';

const OPEN_LINKS_VIEW_COMMAND = 'jiraOps.openLinksView';
const CONNECT_JIRA_COMMAND = 'jiraOps.connectJira';
const DISCONNECT_JIRA_COMMAND = 'jiraOps.disconnectJira';
const OPEN_SETTINGS_COMMAND = 'jiraOps.openSettings';
const CLEAR_JIRA_CREDENTIALS_COMMAND = 'jiraOps.clearJiraCredentials';
const OUTPUT_CHANNEL_NAME = 'Jira Ops';

export function activate(context: vscode.ExtensionContext): void {
  setJiraSecretStorage(context.secrets);

  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const panelProvider = new JiraOpsPanelProvider(context.extensionUri, outputChannel);

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
}

export function deactivate(): void {
  return undefined;
}
