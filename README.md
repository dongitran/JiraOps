# JiraOps

[![Version](https://img.shields.io/badge/version-0.1.15--pre--release-2aa198)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-007acc)](https://code.visualstudio.com/api)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](./tsconfig.json)

JiraOps is a VS Code extension for daily Jira operations. It shows Jira issues
assigned to you, surfaces GitLab merge requests from Jira remote links, and opens
issue details in a wider VS Code editor tab.

## ✨ Features

- **Assigned-ticket dashboard:** load issues assigned to the connected Jira user with a bounded JQL search.
- **Compact native header:** show connection state in the JiraOps view title bar instead of an internal webview banner.
- **GitLab MR focus:** keep assigned-ticket cards compact and show direct plus clone-linked merge requests in Details.
- **Wide issue details:** open a selected issue immediately with a loading state, then show formatted Jira content, comments, image attachments, merge requests, and Jira web links.
- **Detail actions:** change available Jira statuses and log focused work time from the wide Details tab.
- **Assigned issue update notifications:** poll Jira in the background, refresh assigned tickets from the same result, persist local unread history, and surface unread updates in the sidebar.
- **Cached detail reopen:** reuse fresh issue detail and remote-link cache entries so recently opened Details can reopen without another loading state.
- **Explicit Jira connection control:** connect from Home, then manage disconnect from Settings.
- **What Is New tab:** show release notes once per installed JiraOps version.
- **Safe, testable foundation:** validate webview messages, parse Jira responses with Zod, and run deterministic E2E tests without real Jira credentials.

> Current scope: assigned-issue discovery, Jira remote-link display, status
> transitions, and work logs. Jira issue creation, comments, and sprint
> workflows are not implemented yet.

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

Then open **JiraOps** in the Activity Bar, select **Connect Jira**, review the
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
available. Use **JiraOps: Clear Saved Jira OAuth Credentials** from the Command
Palette to remove saved OAuth app credentials.

For status transitions and work logs, the Atlassian OAuth app also needs the
`write:jira-work` scope.

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
| `npm run package` | Build a local stable VSIX package |
| `npm run package:pre` | Build a local pre-release VSIX package |

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
  -> Details opens immediately with a loading webview
  -> fetchJiraIssueDetail loads formatted description, comments, attachments, and clone links
  -> JiraOpsIssueDetailController caches detail bundles and handles transition/worklog actions
  -> fetchJiraRemoteLinks loads direct and clone issue links with TTL cache
  -> NotificationPoller reuses assigned-issue search results for unread update notices
  -> globalState stores bounded JiraOps notification history and update baselines
  -> extractGitLabMergeRequests derives MR rows from remote links
  -> sidebar renders assigned tickets and WebviewPanel renders issue details
```

| File | Responsibility |
| --- | --- |
| [`src/extension.ts`](./src/extension.ts) | VS Code activation and view registration |
| [`src/jiraOpsPanel.ts`](./src/jiraOpsPanel.ts) | Sidebar webview, CSP, messages, dashboard orchestration |
| [`src/jiraOpsIssueDetailController.ts`](./src/jiraOpsIssueDetailController.ts) | Issue detail cache, Jira transition loading, and Details write actions |
| [`src/issueDetailPanel.ts`](./src/issueDetailPanel.ts) | Wide issue detail editor webview |
| [`src/notificationPoller.ts`](./src/notificationPoller.ts) | Background assigned issue update polling |
| [`src/jiraNotifications.ts`](./src/jiraNotifications.ts) | Local unread notification state and issue update comparison |
| [`src/jiraOpsSettings.ts`](./src/jiraOpsSettings.ts) | Persisted JiraOps settings normalization |
| [`src/whatsNew.ts`](./src/whatsNew.ts) | Once-per-version What Is New release notes |
| [`src/jiraClient.ts`](./src/jiraClient.ts) | OAuth token lifecycle and Jira REST calls |
| [`src/jiraIssueDetails.ts`](./src/jiraIssueDetails.ts) | Jira issue description, comments, attachments, and clone-link parsing |
| [`src/dashboardItems.ts`](./src/dashboardItems.ts) | Assigned issue and web-link dashboard mapping |
| [`src/remoteLinks.ts`](./src/remoteLinks.ts) | Zod validation, link mapping, and GitLab MR extraction |
| [`src/webviewMessages.ts`](./src/webviewMessages.ts) | Webview message contracts and guards |
| [`e2e/tests`](./e2e/tests) | Playwright E2E tests |

## 🛠 Troubleshooting

| Symptom | Check |
| --- | --- |
| `Jira connection could not be completed.` | Re-run **Connect Jira** and verify OAuth app credentials, callback URL, and scopes |
| `Assigned tickets could not be loaded.` | Jira issue access, token freshness, JQL search permissions |
| Detail has no GitLab merge requests | The issue may only have generic Jira remote links, or its clone-linked tickets may have no MR links |
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
