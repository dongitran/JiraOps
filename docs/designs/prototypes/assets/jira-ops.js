const appElement = document.getElementById('app');
const WEBVIEW_READY_MESSAGE_TYPE = 'jiraOps.webviewReady';
const FETCH_LINKS_MESSAGE_TYPE = 'jiraOps.fetchLinks';
const CONNECT_JIRA_MESSAGE_TYPE = 'jiraOps.connectJira';
const DISCONNECT_JIRA_MESSAGE_TYPE = 'jiraOps.disconnectJira';
const OPEN_SETTINGS_MESSAGE_TYPE = 'jiraOps.openSettings';
const OPEN_EXTERNAL_LINK_MESSAGE_TYPE = 'jiraOps.openExternalLink';
const LOADING_MESSAGE_TYPE = 'jiraOps.linksLoading';
const LOADED_MESSAGE_TYPE = 'jiraOps.linksLoaded';
const ERROR_MESSAGE_TYPE = 'jiraOps.linksError';
const CONNECTION_LOADING_MESSAGE_TYPE = 'jiraOps.connectionLoading';
const CONNECTION_CHANGED_MESSAGE_TYPE = 'jiraOps.connectionChanged';

const MOCK_LINKS = [
  {
    id: 'design-review',
    title: 'Design Review',
    url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/1453/Design+Review',
    relationship: 'Confluence',
    host: 'example.atlassian.net',
  },
  {
    id: 'service-runbook',
    title: 'Service Runbook',
    url: 'https://docs.example.com/runbooks/payments/incident-response',
    relationship: 'Runbook',
    host: 'docs.example.com',
  },
  {
    id: 'release-note',
    title: 'Release Note',
    url: 'https://github.com/example/platform/releases/tag/2026.04.29',
    relationship: 'Release',
    host: 'github.com',
  },
];

const state = {
  issueInput: 'OPS-123',
  issueKey: '',
  links: [],
  status: 'Connect Jira to fetch remote web links.',
  tone: 'info',
  loading: false,
  connection: 'disconnected',
  cloudName: '',
  screen: 'home',
};
const vscodeApi = resolveVscodeApi();
let didPostReadyMessage = false;

if (!(appElement instanceof HTMLElement)) {
  throw new Error('JiraOps prototype root was not found.');
}

render();
postReadyMessage();

window.addEventListener('message', (event) => {
  if (!isRecord(event.data)) {
    return;
  }

  if (event.data.type === LOADING_MESSAGE_TYPE) {
    handleLoadingMessage(event.data);
    return;
  }

  if (event.data.type === LOADED_MESSAGE_TYPE) {
    handleLoadedMessage(event.data);
    return;
  }

  if (event.data.type === ERROR_MESSAGE_TYPE) {
    handleErrorMessage(event.data);
    return;
  }

  if (event.data.type === CONNECTION_LOADING_MESSAGE_TYPE) {
    handleConnectionLoadingMessage();
    return;
  }

  if (event.data.type === CONNECTION_CHANGED_MESSAGE_TYPE) {
    handleConnectionChangedMessage(event.data);
    return;
  }

  if (event.data.type === OPEN_SETTINGS_MESSAGE_TYPE) {
    openSettingsScreen();
  }
});

function render() {
  appElement.innerHTML = `
    <section class="jira-shell" aria-label="Jira Ops links workspace">
      ${renderHeader()}
      ${state.screen === 'settings' ? renderSettingsScreen() : renderHomeScreen()}
    </section>
  `;

  const form = appElement.querySelector('form');
  const input = appElement.querySelector('#issue-input');
  if (state.screen === 'home' && (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement))) {
    throw new Error('JiraOps prototype form was not rendered.');
  }

  if (form instanceof HTMLFormElement && input instanceof HTMLInputElement) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitIssueInput(input.value);
    });

    input.addEventListener('input', () => {
      state.issueInput = input.value;
    });
  }

  for (const connectionButton of appElement.querySelectorAll('button[data-connection-action]')) {
    connectionButton.addEventListener('click', () => {
      handleConnectionAction(connectionButton.dataset.connectionAction ?? '');
    });
  }

  for (const navigationButton of appElement.querySelectorAll('button[data-nav-action]')) {
    navigationButton.addEventListener('click', () => {
      handleNavigationAction(navigationButton.dataset.navAction ?? '');
    });
  }

  for (const link of appElement.querySelectorAll('a[data-url]')) {
    link.addEventListener('click', (event) => {
      if (vscodeApi === null || !(event.currentTarget instanceof HTMLAnchorElement)) {
        return;
      }

      event.preventDefault();
      vscodeApi.postMessage({
        type: OPEN_EXTERNAL_LINK_MESSAGE_TYPE,
        url: event.currentTarget.href,
      });
    });
  }
}

function renderHeader() {
  return `
    <header class="jira-header">
      <div class="title-row">
        <div class="title-copy">
          <h1>Jira Ops</h1>
          <p class="subtitle">Find web links attached to a Jira issue.</p>
        </div>
        <div class="header-actions">
          <span class="connection-state" data-state="${escapeAttribute(state.connection)}">${escapeHtml(renderConnectionPillText())}</span>
          <button class="icon-button" data-nav-action="settings" type="button" aria-label="Open Settings" aria-pressed="${state.screen === 'settings' ? 'true' : 'false'}" title="Open Settings">
            <span aria-hidden="true">&#9881;</span>
          </button>
        </div>
      </div>
    </header>
  `;
}

function renderHomeScreen() {
  return `
    ${renderConnectionRegion()}

    <form class="search-region" aria-label="Jira issue lookup">
      <div class="field">
        <label for="issue-input">Jira issue URL or key</label>
        <input id="issue-input" name="issue-input" value="${escapeHtml(state.issueInput)}" autocomplete="off" />
      </div>
      <button class="fetch-button" type="submit"${state.loading || state.connection !== 'connected' ? ' disabled' : ''}>Fetch</button>
    </form>

    <p class="status-line" role="status" data-tone="${state.tone}">${escapeHtml(state.status)}</p>

    <section class="links-region" aria-label="Jira web links">
      ${renderLinks()}
    </section>
  `;
}

function renderSettingsScreen() {
  return `
    <section class="settings-page" aria-label="Jira Ops settings">
      <div class="settings-heading">
        <button class="back-button" data-nav-action="home" type="button" aria-label="Back to links" title="Back to links">
          <span aria-hidden="true">&#8592;</span>
        </button>
        <div class="settings-title">
          <h2>Settings</h2>
          <p>Jira connection</p>
        </div>
      </div>
      ${renderSettingsConnectionRegion()}
      <p class="status-line" role="status" data-tone="${state.tone}">${escapeHtml(state.status)}</p>
    </section>
  `;
}

function renderConnectionRegion() {
  const connected = state.connection === 'connected';
  const connecting = state.connection === 'connecting';
  const title = connected
    ? `Connected to ${state.cloudName.length > 0 ? state.cloudName : 'Jira Cloud'}`
    : connecting
      ? 'Connecting Jira...'
      : 'Jira is not connected';
  const detail = connected
    ? 'Ready to load visible issue links.'
    : 'Connect once to reuse OAuth tokens.';
  const button = connected
    ? ''
    : `<button class="connection-button" data-variant="primary" data-connection-action="connect" type="button"${connecting ? ' disabled' : ''}>${connecting ? 'Connecting...' : 'Connect Jira'}</button>`;

  return `
    <section class="connection-region" aria-label="Jira connection">
      <div class="connection-copy">
        <span class="connection-eyebrow">Jira Cloud</span>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      ${button}
    </section>
  `;
}

function renderSettingsConnectionRegion() {
  const connected = state.connection === 'connected';
  const connecting = state.connection === 'connecting';
  const action = connected ? 'disconnect' : 'connect';
  const buttonText = connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect Jira';
  const title = connected
    ? `Connected to ${state.cloudName.length > 0 ? state.cloudName : 'Jira Cloud'}`
    : connecting
      ? 'Connecting Jira...'
      : 'Jira is not connected';
  const detail = connected
    ? 'Saved tokens stay available until disconnected.'
    : 'Connect Jira before fetching issue links.';

  return `
    <section class="connection-region settings-connection" aria-label="Jira connection settings">
      <div class="connection-copy">
        <span class="connection-eyebrow">Jira Cloud</span>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <button class="connection-button" data-variant="${connected ? 'secondary' : 'primary'}" data-connection-action="${action}" type="button"${connecting ? ' disabled' : ''}>${escapeHtml(buttonText)}</button>
    </section>
  `;
}

function renderLinks() {
  if (state.links.length === 0) {
    return `
      <div class="empty-state">
        <strong>No web links</strong>
        <span>This issue does not have Jira remote links yet.</span>
      </div>
    `;
  }

  const rows = state.links
    .map((link) => {
      return `
        <li class="link-item">
          <a href="${escapeAttribute(link.url)}" target="_blank" rel="noreferrer" data-url="${escapeAttribute(link.url)}">${escapeHtml(link.title)}</a>
          <span class="link-meta">${escapeHtml(link.relationship)} - ${escapeHtml(link.url)}</span>
        </li>
      `;
    })
    .join('');

  return `
    <div class="summary-row">
      <span class="issue-key">${escapeHtml(state.issueKey)}</span>
      <span>${String(state.links.length)} links</span>
    </div>
    <ul class="link-list">${rows}</ul>
  `;
}

function submitIssueInput(rawInput) {
  const normalizedInput = rawInput.trim();
  state.issueInput = normalizedInput;

  if (state.connection !== 'connected') {
    state.issueKey = '';
    state.links = [];
    state.status = 'Connect Jira before fetching links.';
    state.tone = 'error';
    render();
    return;
  }

  if (!isIssueInputValid(normalizedInput)) {
    state.issueKey = '';
    state.links = [];
    state.status = 'Enter a Jira issue key or browse URL.';
    state.tone = 'error';
    render();
    return;
  }

  if (vscodeApi !== null) {
    state.loading = true;
    state.status = 'Loading Jira web links...';
    state.tone = 'info';
    render();
    vscodeApi.postMessage({
      type: FETCH_LINKS_MESSAGE_TYPE,
      issueInput: normalizedInput,
    });
    return;
  }

  state.issueKey = extractIssueKey(normalizedInput);
  state.links = MOCK_LINKS;
  state.status = `${String(MOCK_LINKS.length)} web links found.`;
  state.tone = 'success';
  render();
}

function handleConnectionAction(action) {
  if (action === 'connect') {
    connectJira();
    return;
  }

  if (action === 'disconnect') {
    disconnectJira();
  }
}

function handleNavigationAction(action) {
  if (action === 'settings') {
    requestSettingsScreen();
    return;
  }

  if (action === 'home') {
    openHomeScreen();
  }
}

function requestSettingsScreen() {
  if (vscodeApi !== null) {
    vscodeApi.postMessage({ type: OPEN_SETTINGS_MESSAGE_TYPE });
    return;
  }

  openSettingsScreen();
}

function openSettingsScreen() {
  state.screen = 'settings';
  render();
}

function openHomeScreen() {
  state.screen = 'home';
  render();
}

function connectJira() {
  if (vscodeApi !== null) {
    state.connection = 'connecting';
    state.status = 'Connecting Jira...';
    state.tone = 'info';
    render();
    vscodeApi.postMessage({ type: CONNECT_JIRA_MESSAGE_TYPE });
    return;
  }

  applyConnectionState(true, 'Example Jira', 'Connected to Example Jira.');
}

function disconnectJira() {
  if (vscodeApi !== null) {
    vscodeApi.postMessage({ type: DISCONNECT_JIRA_MESSAGE_TYPE });
    return;
  }

  applyConnectionState(false, '', 'Jira disconnected.');
}

function handleLoadingMessage(message) {
  state.issueKey = typeof message.issueKey === 'string' ? message.issueKey : '';
  state.links = [];
  state.status = 'Loading Jira web links...';
  state.tone = 'info';
  state.loading = true;
  render();
}

function handleLoadedMessage(message) {
  const links = Array.isArray(message.links) ? message.links.filter(isRemoteWebLink) : [];
  state.issueKey = typeof message.issueKey === 'string' ? message.issueKey : '';
  state.links = links;
  state.status =
    links.length === 0 ? 'No web links found.' : `${String(links.length)} web links found.`;
  state.tone = links.length === 0 ? 'info' : 'success';
  state.loading = false;
  render();
}

function handleErrorMessage(message) {
  if (state.connection === 'connecting') {
    state.connection = 'disconnected';
    state.cloudName = '';
  }

  state.links = [];
  state.status =
    typeof message.message === 'string' && message.message.length > 0
      ? message.message
      : 'Jira remote links could not be loaded.';
  state.tone = 'error';
  state.loading = false;
  render();
}

function handleConnectionLoadingMessage() {
  state.connection = 'connecting';
  state.status = 'Connecting Jira...';
  state.tone = 'info';
  render();
}

function handleConnectionChangedMessage(message) {
  const connected = message.connected === true;
  const cloudName = typeof message.cloudName === 'string' ? message.cloudName : '';
  const fallback = connected ? 'Jira connected.' : 'Jira disconnected.';
  const status = typeof message.message === 'string' ? message.message : fallback;
  applyConnectionState(connected, cloudName, status);
}

function applyConnectionState(connected, cloudName, status) {
  state.connection = connected ? 'connected' : 'disconnected';
  state.cloudName = connected ? cloudName : '';
  state.status = status;
  state.tone = connected ? 'success' : 'info';
  state.loading = false;
  if (!connected) {
    state.issueKey = '';
    state.links = [];
  }
  render();
}

function renderConnectionPillText() {
  if (state.connection === 'connected') {
    return 'Connected';
  }

  if (state.connection === 'connecting') {
    return 'Connecting';
  }

  return 'Not connected';
}

function isIssueInputValid(value) {
  return extractIssueKey(value).length > 0;
}

function extractIssueKey(value) {
  const directMatch = value.match(/^[A-Z][A-Z0-9]+-\d+$/i);
  if (directMatch !== null) {
    return directMatch[0].toUpperCase();
  }

  const browseMatch = value.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[/?#]|$)/i);
  return browseMatch?.[1]?.toUpperCase() ?? '';
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function resolveVscodeApi() {
  if (typeof acquireVsCodeApi !== 'function') {
    return null;
  }

  return acquireVsCodeApi();
}

function postReadyMessage() {
  if (vscodeApi === null || didPostReadyMessage) {
    return;
  }

  didPostReadyMessage = true;
  vscodeApi.postMessage({ type: WEBVIEW_READY_MESSAGE_TYPE });
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function isRemoteWebLink(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    typeof value.relationship === 'string' &&
    typeof value.host === 'string'
  );
}
