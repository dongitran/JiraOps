# Changelog

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
