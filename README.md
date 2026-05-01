# Jira Ops

[![Version](https://img.shields.io/badge/version-0.1.5-2aa198)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-007acc)](https://code.visualstudio.com/api)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](./tsconfig.json)

Jira Ops is a VS Code extension for daily Jira operations. It shows Jira issues
assigned to you, surfaces GitLab merge requests from Jira remote links, and opens
issue details in a wider VS Code editor tab.

## ✨ Features

- **Assigned-ticket dashboard:** load issues assigned to the connected Jira user with a bounded JQL search.
- **GitLab MR focus:** show merge requests on Home and keep generic web links in the detail view.
- **Wide issue details:** open a selected issue in an editor tab with merge requests first and all Jira web links below.
- **Explicit Jira connection control:** connect from Home, then manage disconnect from Settings.
- **Safe, testable foundation:** validate webview messages, parse Jira responses with Zod, and run deterministic E2E tests without real Jira credentials.

> Current scope: assigned-issue discovery and Jira remote-link display. Jira
> writes such as issue creation, comments, transitions, and sprint workflows are
> not implemented yet.

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

Then open **Jira Ops** in the Activity Bar, select **Connect Jira**, review the
assigned-ticket dashboard, and select **Details** for a wider issue view.

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

Use **Connect Jira** to start the browser OAuth flow. Dashboard refresh requires
an existing connection and refreshes expired tokens when a refresh token is
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
  -> jira-ops.js posts dashboard, detail, settings, connection, and external-link messages
  -> JiraOpsPanelProvider validates the message
  -> OAuthJiraTokenProvider connects, disconnects, resolves, or refreshes Jira tokens
  -> fetchAssignedJiraIssues calls Atlassian enhanced JQL search
  -> fetchJiraRemoteLinks loads links for each assigned issue
  -> extractGitLabMergeRequests derives MR rows from remote links
  -> sidebar renders assigned tickets and WebviewPanel renders issue details
```

| File | Responsibility |
| --- | --- |
| [`src/extension.ts`](./src/extension.ts) | VS Code activation and view registration |
| [`src/jiraOpsPanel.ts`](./src/jiraOpsPanel.ts) | Sidebar webview, CSP, messages, dashboard orchestration |
| [`src/issueDetailPanel.ts`](./src/issueDetailPanel.ts) | Wide issue detail editor webview |
| [`src/jiraClient.ts`](./src/jiraClient.ts) | OAuth token lifecycle and Jira REST calls |
| [`src/dashboardItems.ts`](./src/dashboardItems.ts) | Assigned issue and web-link dashboard mapping |
| [`src/remoteLinks.ts`](./src/remoteLinks.ts) | Zod validation, link mapping, and GitLab MR extraction |
| [`src/webviewMessages.ts`](./src/webviewMessages.ts) | Webview message contracts and guards |
| [`e2e/tests`](./e2e/tests) | Playwright E2E tests |

## 🛠 Troubleshooting

| Symptom | Check |
| --- | --- |
| `Jira connection could not be completed.` | Re-run **Connect Jira** and verify OAuth app credentials, callback URL, and scopes |
| `Assigned tickets could not be loaded.` | Jira issue access, token freshness, JQL search permissions |
| Detail has no GitLab merge requests | The issue may only have generic Jira remote links, which remain visible in Details |
| Browser login never completes | Port `30129` is free and callback URL matches the OAuth app |
| E2E cannot find VS Code | Set `VSCODE_EXECUTABLE_PATH` |
| E2E returns mock assigned issues | Expected. E2E uses `JIRA_OPS_TEST_MODE=1` |

## 🗺 Roadmap

- Better authentication and partial Jira API error states.
- Jira site selection for accounts with multiple cloud sites.
- Optional GitLab API enrichment for MR state, pipeline, reviewers, and approval signals.
- More Jira issue operations after read-only dashboard workflows are stable.
- Marketplace polish with PNG icon and screenshots.

## 👨‍💻 Author

**dongtran** ✨

## 📄 License

MIT

---

Made with ❤️ to make your work life easier!
