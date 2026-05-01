# Changelog

## 0.1.11

- Show a What Is New editor tab once per JiraOps version.
- Add configurable assigned issue update polling with a 1 minute default.
- Surface unread assigned issue updates in the JiraOps sidebar notification button.
- Refresh assigned tickets from the same polling result instead of running a second ticket cron.
- Reopen recently loaded issue Details from cache when issue detail and remote-link data are still fresh.
- Restore CI publishing to the VS Code Marketplace pre-release lane for this test build.

## 0.1.10

- Promote JiraOps to a stable VS Code Marketplace release.
- Publish CI-built VSIX packages and GitHub releases as stable instead of pre-release.

## 0.1.9

- Keep assigned-ticket cards focused on Jira issue metadata and move merge request rows into Details.
- Open Details immediately with a centered loading state while Jira detail and remote-link data loads.
- Render Jira description and comment formatting for headings, lists, links, code, and emphasis.
- Cache issue detail and remote-link fetches with TTL-based output-channel cache logs.
- Cover cloned Jira work items that have multiple GitLab merge requests.

## 0.1.8

- Reset webview body padding so the JiraOps sidebar fills the full activity bar width.
- Cover the regression with a sidebar geometry assertion and harden the metadata-hides E2E check.

## 0.1.7

- Move the connected state into the native JiraOps view header.
- Remove the internal webview connection banner so assigned tickets start higher.
- Add E2E screenshot and geometry coverage for sidebar density.

## 0.1.6

- Compact the JiraOps sidebar header and remove duplicate in-webview Settings controls.
- Prevent long single-token issue titles from overflowing compact ticket cards.
- Hide updated time first and priority second as ticket metadata runs out of width.
- Add issue description, comments, image attachments, and clone-linked GitLab merge requests to the wide Details view.
- Keep raw link URLs out of detail cards while preserving safe external link opening.

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
