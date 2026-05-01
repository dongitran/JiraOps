# Changelog

## 0.1.5

- Replace manual web-link lookup with an assigned Jira ticket dashboard.
- Surface GitLab merge requests on Home while keeping generic Jira web links in issue details.
- Add a wide VS Code editor detail tab for each assigned issue.
- Add Jira enhanced JQL search, GitLab MR URL extraction, dashboard unit tests, and MR-focused E2E coverage.

## 0.1.4

- Rename the JiraOps view to Jira Ops and add a Settings gear action.
- Move Jira disconnect control from Home to Settings.
- Add output-channel logs for extension actions without logging OAuth secrets or tokens.
- Publish CI builds as VS Code Marketplace pre-releases.

## 0.1.3

- Polyfill `import.meta.url` in the bundled extension so the `jira-oauth-client` (and its `open` dependency) loads correctly under the CJS runtime.

## 0.1.2

- Prompt for missing Jira OAuth app credentials and store them in VS Code SecretStorage.
- Recover the webview connection button after failed or canceled Jira connection attempts.

## 0.1.1

- Bundle the extension runtime with esbuild to reduce VSIX file count and package size.
- Exclude dependency folders and sourcemaps from Marketplace packages.

## 0.1.0

- Initial JiraOps prototype and extension scaffold.
