import * as vscode from 'vscode';

import { JiraOpsPanelProvider, LINKS_VIEW_ID } from './jiraOpsPanel';

const OPEN_LINKS_VIEW_COMMAND = 'jiraOps.openLinksView';
const CONNECT_JIRA_COMMAND = 'jiraOps.connectJira';
const DISCONNECT_JIRA_COMMAND = 'jiraOps.disconnectJira';
const OUTPUT_CHANNEL_NAME = 'JiraOps';

export function activate(context: vscode.ExtensionContext): void {
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

  context.subscriptions.push(
    outputChannel,
    panelProvider,
    viewRegistration,
    openLinksViewCommand,
    connectJiraCommand,
    disconnectJiraCommand
  );
}

export function deactivate(): void {
  return undefined;
}
