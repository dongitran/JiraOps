# Jira Ops

[![Version](https://img.shields.io/badge/version-0.1.4-2aa198)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-007acc)](https://code.visualstudio.com/api)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](./tsconfig.json)

Jira Ops is a VS Code extension for Jira operations. The current MVP finds
supported remote web links attached to a Jira issue and displays them inside a
focused Activity Bar webview.

## ✨ Features

- **One-input Jira lookup:** paste an issue key or browse URL and fetch linked operational resources.
- **Explicit Jira connection control:** connect from Home, then manage disconnect from Settings.
- **Focused VS Code experience:** review remote links in a clean Activity Bar webview and open them externally.
- **Safe, testable foundation:** validate webview messages, parse Jira responses with Zod, and run deterministic E2E tests without real Jira credentials.

> Current scope: remote web-link discovery only. Issue creation, comments,
> transitions, JQL search, and sprint workflows are not implemented yet.

## 🚀 Quick Start

Requirements:

- VS Code `^1.90.0`
- Node.js `>=20`
- npm
- Jira Cloud account and Atlassian OAuth app for real lookups

Install and build:

```bash
npm install
npm --prefix e2e install
npm run build
```

Launch an extension development host:

```bash
code --extensionDevelopmentPath="$(pwd)"
```

Then open **Jira Ops** in the Activity Bar, select **Connect Jira**, enter an
issue key or browse URL, and select **Fetch**.

## 🔐 Jira Authentication

Jira Ops uses
[`jira-oauth-client`](https://www.npmjs.com/package/jira-oauth-client). You can
set these environment variables before the first real connection:

```bash
export JIRA_CLIENT_ID="your-atlassian-oauth-client-id"
export JIRA_CLIENT_SECRET="your-atlassian-oauth-client-secret"
```

If those variables are not available to VS Code, **Connect Jira** asks for the
OAuth app client ID and client secret, then saves them in VS Code SecretStorage
(system keychain). Environment variables still take priority over saved values.

Your Atlassian OAuth app must allow:

```text
http://localhost:30129/callback
```

Use **Connect Jira** to start the browser OAuth flow. **Fetch** requires an
existing connection and refreshes expired tokens when a refresh token is
available. Use **Jira Ops: Clear Saved Jira OAuth Credentials** from the Command
Palette to remove saved OAuth app credentials.

Never log, commit, or share OAuth secrets, access tokens, refresh tokens,
Authorization headers, or raw credential payloads.

## 🧪 Development

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile extension source into `dist` |
| `npm run validate:root` | Typecheck, lint, spellcheck, and run unit tests |
| `npm --prefix e2e run validate` | Typecheck, lint, and spellcheck E2E code |
| `npm --prefix e2e test` | Run Playwright against a VS Code extension host |
| `npm run validate` | Run root validation and E2E validation |
| `npm run package -- --pre-release` | Build a local pre-release VSIX package |

Prototype review:

```bash
python3 -m http.server 4174 --bind 127.0.0.1 --directory docs/designs/prototypes
```

Open `http://127.0.0.1:4174/index.html`.

## 🧭 Architecture

```text
VS Code Activity Bar
  -> jiraOps.linksView webview
  -> jira-ops.js posts jiraOps.openSettings, jiraOps.connectJira, jiraOps.disconnectJira, or jiraOps.fetchLinks
  -> JiraOpsPanelProvider validates the message
  -> parseIssueInput normalizes the issue key
  -> OAuthJiraTokenProvider connects, disconnects, resolves, or refreshes Jira tokens
  -> fetchJiraRemoteLinks calls Atlassian REST API
  -> parseRemoteLinksResponse maps safe display rows
  -> webview renders loading, success, empty, or error state
```

| File | Responsibility |
| --- | --- |
| [`src/extension.ts`](./src/extension.ts) | VS Code activation and view registration |
| [`src/jiraOpsPanel.ts`](./src/jiraOpsPanel.ts) | Webview HTML, CSP, messages, fetch orchestration |
| [`src/jiraClient.ts`](./src/jiraClient.ts) | OAuth token lifecycle and Jira REST calls |
| [`src/issueInput.ts`](./src/issueInput.ts) | Issue key and browse URL parsing |
| [`src/remoteLinks.ts`](./src/remoteLinks.ts) | Zod validation and link mapping |
| [`src/webviewMessages.ts`](./src/webviewMessages.ts) | Webview message contracts and guards |
| [`e2e/tests`](./e2e/tests) | Playwright E2E tests |

## 🛠 Troubleshooting

| Symptom | Check |
| --- | --- |
| `Jira connection could not be completed.` | Re-run **Connect Jira** and verify OAuth app credentials, callback URL, and scopes |
| `Jira remote links could not be loaded.` | Issue access, token freshness, Jira remote-link permissions |
| Browser login never completes | Port `30129` is free and callback URL matches the OAuth app |
| E2E cannot find VS Code | Set `VSCODE_EXECUTABLE_PATH` |
| E2E returns mock links | Expected. E2E uses `JIRA_OPS_TEST_MODE=1` |

## 🗺 Roadmap

- Better authentication error states.
- Jira site selection for accounts with multiple cloud sites.
- More Jira issue operations after remote-link discovery is stable.
- Marketplace polish with PNG icon and screenshots.

## 👨‍💻 Author

**dongtran** ✨

## 📄 License

MIT

---

Made with ❤️ to make your work life easier!
