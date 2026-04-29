import * as vscode from 'vscode';

import {
  JiraCredentialSetupCanceledError,
  applyJiraOAuthCredentialsToEnv,
  ensureJiraOAuthCredentials,
  getJiraOAuthCredentials,
  type JiraCredentialInputOptions,
} from './jiraCredentials';
import {
  fetchJiraRemoteLinks,
  OAuthJiraTokenProvider,
  type JiraConnectionStatus,
} from './jiraClient';
import { parseIssueInput } from './issueInput';
import type { RemoteWebLink } from './remoteLinks';
import { isJiraOpsTestMode, resolveTestRemoteLinks } from './testModeData';
import {
  CONNECTION_CHANGED_MESSAGE_TYPE,
  CONNECTION_LOADING_MESSAGE_TYPE,
  ERROR_MESSAGE_TYPE,
  LOADED_MESSAGE_TYPE,
  LOADING_MESSAGE_TYPE,
  isConnectJiraMessage,
  isDisconnectJiraMessage,
  isFetchLinksMessage,
  isOpenExternalLinkMessage,
  isWebviewReadyMessage,
} from './webviewMessages';

export const LINKS_VIEW_ID = 'jiraOps.linksView';

const WEBVIEW_ASSET_PATH = ['docs', 'designs', 'prototypes', 'assets'] as const;
const TEST_JIRA_CLOUD_NAME = 'Example Jira';

export class JiraOpsPanelProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private webviewView: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private testModeConnected = false;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly tokenProvider = new OAuthJiraTokenProvider()
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    const assetsRoot = vscode.Uri.joinPath(this.extensionUri, ...WEBVIEW_ASSET_PATH);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [assetsRoot],
    };

    const subscription = webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleWebviewMessage(message);
    });
    this.disposables.push(subscription);

    webviewView.webview.html = this.buildHtml(
      webviewView.webview,
      createNonce(),
      assetsRoot
    );
  }

  public dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  public async connectJiraFromCommand(): Promise<void> {
    await this.handleConnectJira();
  }

  public async disconnectJiraFromCommand(): Promise<void> {
    await this.handleDisconnectJira();
  }

  private async handleWebviewMessage(message: unknown): Promise<void> {
    if (isWebviewReadyMessage(message)) {
      await this.handleWebviewReady();
      return;
    }

    if (isConnectJiraMessage(message)) {
      await this.handleConnectJira();
      return;
    }

    if (isDisconnectJiraMessage(message)) {
      await this.handleDisconnectJira();
      return;
    }

    if (isFetchLinksMessage(message)) {
      await this.handleFetchLinks(message.issueInput);
      return;
    }

    if (isOpenExternalLinkMessage(message)) {
      await vscode.env.openExternal(vscode.Uri.parse(message.url));
    }
  }

  private async handleWebviewReady(): Promise<void> {
    const status = await this.loadConnectionStatus();
    this.postConnectionChanged(
      status,
      status.connected ? connectionSuccessMessage(status) : 'Connect Jira to fetch remote web links.'
    );
  }

  private async handleConnectJira(): Promise<void> {
    this.postMessage({ type: CONNECTION_LOADING_MESSAGE_TYPE });

    try {
      const status = await this.connectJira();
      this.outputChannel.appendLine('Jira connection is ready.');
      this.postConnectionChanged(status, connectionSuccessMessage(status));
    } catch (error) {
      this.postMessage({
        type: ERROR_MESSAGE_TYPE,
        message: connectionErrorMessage(error),
      });
    }
  }

  private async handleDisconnectJira(): Promise<void> {
    try {
      const status = await this.disconnectJira();
      this.outputChannel.appendLine('Jira connection was cleared.');
      this.postConnectionChanged(status, 'Jira disconnected.');
    } catch {
      this.postMessage({
        type: ERROR_MESSAGE_TYPE,
        message: 'Jira connection could not be cleared.',
      });
    }
  }

  private async handleFetchLinks(issueInput: string): Promise<void> {
    const parsedInput = parseIssueInput(issueInput);
    if (!parsedInput.ok) {
      this.postMessage({
        type: ERROR_MESSAGE_TYPE,
        message: parsedInput.error,
      });
      return;
    }

    this.postMessage({
      type: LOADING_MESSAGE_TYPE,
      issueKey: parsedInput.issueKey,
    });

    try {
      const links = await this.loadRemoteLinks(parsedInput.issueKey);
      this.outputChannel.appendLine(
        `Loaded ${String(links.length)} Jira web links for ${parsedInput.issueKey}.`
      );
      this.postMessage({
        type: LOADED_MESSAGE_TYPE,
        issueKey: parsedInput.issueKey,
        links,
      });
    } catch (error) {
      this.postMessage({
        type: ERROR_MESSAGE_TYPE,
        message:
          error instanceof JiraConnectionRequiredError
            ? 'Connect Jira before fetching links.'
            : 'Jira remote links could not be loaded.',
      });
    }
  }

  private async loadRemoteLinks(issueKey: string): Promise<RemoteWebLink[]> {
    if (isJiraOpsTestMode()) {
      if (!this.testModeConnected) {
        throw new JiraConnectionRequiredError();
      }

      return resolveTestRemoteLinks(issueKey);
    }

    const tokens = await this.tokenProvider.getStoredOrRefreshTokens();
    if (tokens === null) {
      throw new JiraConnectionRequiredError();
    }

    return fetchJiraRemoteLinks({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
      issueKey,
    });
  }

  private async loadConnectionStatus(): Promise<JiraConnectionStatus> {
    if (isJiraOpsTestMode()) {
      return testConnectionStatus(this.testModeConnected);
    }

    await this.applyKnownJiraOAuthCredentials();
    return this.tokenProvider.getConnectionStatus();
  }

  private async connectJira(): Promise<JiraConnectionStatus> {
    if (isJiraOpsTestMode()) {
      this.testModeConnected = true;
      return testConnectionStatus(true);
    }

    await this.prepareJiraOAuthCredentials();
    return this.tokenProvider.connect();
  }

  private async disconnectJira(): Promise<JiraConnectionStatus> {
    if (isJiraOpsTestMode()) {
      this.testModeConnected = false;
      return testConnectionStatus(false);
    }

    return this.tokenProvider.disconnect();
  }

  private async applyKnownJiraOAuthCredentials(): Promise<void> {
    const credentials = await getJiraOAuthCredentials();
    applyJiraOAuthCredentialsToEnv(credentials);
  }

  private async prepareJiraOAuthCredentials(): Promise<void> {
    await ensureJiraOAuthCredentials({
      showInputBox: (options: JiraCredentialInputOptions) => {
        return vscode.window.showInputBox(options);
      },
    });
  }

  private postConnectionChanged(
    status: JiraConnectionStatus,
    message: string
  ): void {
    this.postMessage({
      type: CONNECTION_CHANGED_MESSAGE_TYPE,
      connected: status.connected,
      cloudName: status.cloudName ?? '',
      message,
    });
  }

  private postMessage(message: Record<string, unknown>): void {
    void this.webviewView?.webview.postMessage(message);
  }

  private buildHtml(
    webview: vscode.Webview,
    nonce: string,
    assetsRoot: vscode.Uri
  ): string {
    const scriptSrc = webview
      .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'jira-ops.js'))
      .toString();
    const cssSrc = webview
      .asWebviewUri(vscode.Uri.joinPath(assetsRoot, 'jira-ops.css'))
      .toString();
    const csp = buildCsp(webview, nonce);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>JiraOps</title>
    <link rel="stylesheet" href="${cssSrc}" />
  </head>
  <body class="jira-ops-page jira-ops-extension">
    <main id="app"></main>
    <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
  </body>
</html>`;
  }
}

function buildCsp(webview: vscode.Webview, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
  ].join('; ');
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 24; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    nonce += alphabet[randomIndex] ?? 'A';
  }
  return nonce;
}

function testConnectionStatus(connected: boolean): JiraConnectionStatus {
  return {
    connected,
    cloudName: connected ? TEST_JIRA_CLOUD_NAME : null,
  };
}

function connectionSuccessMessage(status: JiraConnectionStatus): string {
  return `Connected to ${status.cloudName ?? 'Jira Cloud'}.`;
}

function connectionErrorMessage(error: unknown): string {
  if (error instanceof JiraCredentialSetupCanceledError) {
    return error.message;
  }

  if (error instanceof Error && isJiraCredentialSetupMessage(error.message)) {
    return error.message;
  }

  return 'Jira connection could not be completed.';
}

function isJiraCredentialSetupMessage(message: string): boolean {
  return message.startsWith('Jira OAuth client ');
}

class JiraConnectionRequiredError extends Error {}
