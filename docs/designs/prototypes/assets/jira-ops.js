const appElement = document.getElementById('app');
const WEBVIEW_READY_MESSAGE_TYPE = 'jiraOps.webviewReady';
const REFRESH_DASHBOARD_MESSAGE_TYPE = 'jiraOps.refreshDashboard';
const OPEN_ISSUE_DETAIL_MESSAGE_TYPE = 'jiraOps.openIssueDetail';
const CONNECT_JIRA_MESSAGE_TYPE = 'jiraOps.connectJira';
const DISCONNECT_JIRA_MESSAGE_TYPE = 'jiraOps.disconnectJira';
const OPEN_SETTINGS_MESSAGE_TYPE = 'jiraOps.openSettings';
const OPEN_EXTERNAL_LINK_MESSAGE_TYPE = 'jiraOps.openExternalLink';
const DASHBOARD_LOADING_MESSAGE_TYPE = 'jiraOps.dashboardLoading';
const DASHBOARD_LOADED_MESSAGE_TYPE = 'jiraOps.dashboardLoaded';
const DASHBOARD_ERROR_MESSAGE_TYPE = 'jiraOps.dashboardError';
const CONNECTION_LOADING_MESSAGE_TYPE = 'jiraOps.connectionLoading';
const CONNECTION_CHANGED_MESSAGE_TYPE = 'jiraOps.connectionChanged';
const PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE = 'jiraOps.prototypeOpenIssueDetail';

const MOCK_ISSUES = [
  {
    key: 'OPS-123',
    summary: 'Stabilize payment reconciliation alerts',
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'High',
    updated: '2026-05-01T08:20:00.000Z',
    mergeRequests: [
      {
        id: 'ops-123-mr-482',
        title: 'Handle delayed payment settlements',
        url: 'https://gitlab.example.com/platform/payments/-/merge_requests/482',
        host: 'gitlab.example.com',
        projectPath: 'platform/payments',
        iid: '482',
      },
      {
        id: 'ops-123-mr-483',
        title: 'Tighten reconciliation alert thresholds',
        url: 'https://gitlab.example.com/platform/observability/-/merge_requests/483',
        host: 'gitlab.example.com',
        projectPath: 'platform/observability',
        iid: '483',
      },
    ],
    webLinks: [
      {
        id: 'ops-123-mr-482',
        title: 'Handle delayed payment settlements',
        url: 'https://gitlab.example.com/platform/payments/-/merge_requests/482',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: 'ops-123-runbook',
        title: 'Payment incident runbook',
        url: 'https://docs.example.com/runbooks/payments/reconciliation',
        relationship: 'Runbook',
        host: 'docs.example.com',
      },
      {
        id: 'ops-123-design',
        title: 'Alert tuning design note',
        url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/1453/Alert+Tuning',
        relationship: 'Confluence',
        host: 'example.atlassian.net',
      },
    ],
  },
  {
    key: 'OPS-456',
    summary: 'Review checkout service release readiness',
    status: 'Code Review',
    statusCategory: 'In Progress',
    priority: 'Medium',
    updated: '2026-05-01T06:05:00.000Z',
    mergeRequests: [
      {
        id: 'ops-456-mr-214',
        title: 'Prepare checkout release toggle cleanup',
        url: 'https://gitlab.example.com/storefront/checkout/-/merge_requests/214',
        host: 'gitlab.example.com',
        projectPath: 'storefront/checkout',
        iid: '214',
      },
    ],
    webLinks: [
      {
        id: 'ops-456-mr-214',
        title: 'Prepare checkout release toggle cleanup',
        url: 'https://gitlab.example.com/storefront/checkout/-/merge_requests/214',
        relationship: 'Merge request',
        host: 'gitlab.example.com',
      },
      {
        id: 'ops-456-dashboard',
        title: 'Checkout release dashboard',
        url: 'https://grafana.example.com/d/checkout-release',
        relationship: 'Dashboard',
        host: 'grafana.example.com',
      },
    ],
  },
  {
    key: 'OPS-789',
    summary: 'Confirm warehouse webhook retry policy',
    status: 'Waiting for Input',
    statusCategory: 'To Do',
    priority: 'Low',
    updated: '2026-04-30T17:45:00.000Z',
    mergeRequests: [],
    webLinks: [
      {
        id: 'ops-789-spec',
        title: 'Webhook retry policy',
        url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/2209/Webhook+Retry+Policy',
        relationship: 'Confluence',
        host: 'example.atlassian.net',
      },
    ],
  },
];

const state = {
  issues: [],
  status: 'Connect Jira to load assigned tickets.',
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

  if (event.data.type === DASHBOARD_LOADING_MESSAGE_TYPE) {
    handleDashboardLoadingMessage();
    return;
  }

  if (event.data.type === DASHBOARD_LOADED_MESSAGE_TYPE) {
    handleDashboardLoadedMessage(event.data);
    return;
  }

  if (event.data.type === DASHBOARD_ERROR_MESSAGE_TYPE) {
    handleDashboardErrorMessage(event.data);
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
    <section class="jira-shell" aria-label="Jira Ops workspace">
      ${renderHeader()}
      ${state.screen === 'settings' ? renderSettingsScreen() : renderHomeScreen()}
    </section>
  `;

  bindConnectionButtons();
  bindNavigationButtons();
  bindDashboardButtons();
  bindExternalLinks();
}

function renderHeader() {
  return `
    <header class="jira-header">
      <div class="title-row">
        <div class="title-copy">
          <h1>Jira Ops</h1>
          <p class="subtitle">Tickets and merge requests.</p>
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
    ${renderDashboardToolbar()}
    <p class="status-line" role="status" data-tone="${state.tone}">${escapeHtml(state.status)}</p>
    <section class="issues-region" aria-label="Assigned Jira tickets">
      ${renderDashboardContent()}
    </section>
  `;
}

function renderSettingsScreen() {
  return `
    <section class="settings-page" aria-label="Jira Ops settings">
      <div class="settings-heading">
        <button class="back-button" data-nav-action="home" type="button" aria-label="Back to dashboard" title="Back to dashboard">
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
  const detail = connected ? 'Ready to refresh assigned tickets.' : 'Connect once to reuse OAuth tokens.';
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
    : 'Connect Jira before loading assigned tickets.';

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

function renderDashboardToolbar() {
  const issueCount = state.issues.length;
  const mrCount = state.issues.reduce((total, issue) => total + issue.mergeRequests.length, 0);
  const disabled = state.loading || state.connection !== 'connected';

  return `
    <section class="dashboard-toolbar" aria-label="Assigned ticket actions">
      <div class="dashboard-title">
        <span class="dashboard-eyebrow">Assigned to me</span>
        <strong>${String(issueCount)} tickets</strong>
        <span>${String(mrCount)} GitLab merge requests</span>
      </div>
      <button class="refresh-button" data-dashboard-action="refresh" type="button"${disabled ? ' disabled' : ''}>${state.loading ? 'Refreshing...' : 'Refresh'}</button>
    </section>
  `;
}

function renderDashboardContent() {
  if (state.loading) {
    return renderLoadingList();
  }

  if (state.issues.length === 0) {
    return renderEmptyDashboard();
  }

  const issueCards = state.issues.map((issue) => renderIssueCard(issue)).join('');
  return `<div class="issue-list">${issueCards}</div>`;
}

function renderLoadingList() {
  return `
    <div class="issue-list" aria-label="Loading assigned tickets">
      <div class="issue-card skeleton-card"></div>
      <div class="issue-card skeleton-card"></div>
      <div class="issue-card skeleton-card"></div>
    </div>
  `;
}

function renderEmptyDashboard() {
  const title = state.connection === 'connected' ? 'No assigned tickets' : 'Connect Jira first';
  const detail =
    state.connection === 'connected'
      ? 'Assigned issues that are not Done will appear here.'
      : 'The dashboard loads your assigned tickets after Jira is connected.';

  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
  `;
}

function renderIssueCard(issue) {
  return `
    <article class="issue-card" aria-label="${escapeAttribute(issue.key)} assigned ticket">
      <div class="issue-card-header">
        <div class="issue-heading">
          <span class="issue-key">${escapeHtml(issue.key)}</span>
          <h2>${escapeHtml(issue.summary)}</h2>
        </div>
        <button class="detail-button" data-detail-key="${escapeAttribute(issue.key)}" type="button">Details</button>
      </div>
      <div class="issue-meta-row">
        <span class="status-chip" data-category="${escapeAttribute(issue.statusCategory)}">${escapeHtml(issue.status)}</span>
        <span>${escapeHtml(issue.priority)}</span>
        <span>${escapeHtml(formatUpdated(issue.updated))}</span>
      </div>
      ${renderMergeRequests(issue)}
    </article>
  `;
}

function renderMergeRequests(issue) {
  if (issue.mergeRequests.length === 0) {
    return `
      <div class="mr-empty">
        <strong>No merge requests</strong>
        <span>Open details to review supporting Jira web links.</span>
      </div>
    `;
  }

  const rows = issue.mergeRequests.map((mergeRequest) => renderMergeRequestRow(mergeRequest)).join('');
  return `
    <div class="mr-section" aria-label="${escapeAttribute(issue.key)} merge requests">
      <div class="mr-section-heading">
        <strong>GitLab merge requests</strong>
        <span>${String(issue.mergeRequests.length)}</span>
      </div>
      <div class="mr-list">${rows}</div>
    </div>
  `;
}

function renderMergeRequestRow(mergeRequest) {
  return `
    <a class="mr-row" href="${escapeAttribute(mergeRequest.url)}" target="_blank" rel="noreferrer" data-url="${escapeAttribute(mergeRequest.url)}">
      <span>${escapeHtml(mergeRequest.title)}</span>
      <small>${escapeHtml(mergeRequest.projectPath)} !${escapeHtml(mergeRequest.iid)}</small>
    </a>
  `;
}

function bindConnectionButtons() {
  for (const connectionButton of appElement.querySelectorAll('button[data-connection-action]')) {
    connectionButton.addEventListener('click', () => {
      handleConnectionAction(connectionButton.dataset.connectionAction ?? '');
    });
  }
}

function bindNavigationButtons() {
  for (const navigationButton of appElement.querySelectorAll('button[data-nav-action]')) {
    navigationButton.addEventListener('click', () => {
      handleNavigationAction(navigationButton.dataset.navAction ?? '');
    });
  }
}

function bindDashboardButtons() {
  for (const dashboardButton of appElement.querySelectorAll('button[data-dashboard-action]')) {
    dashboardButton.addEventListener('click', () => {
      handleDashboardAction(dashboardButton.dataset.dashboardAction ?? '');
    });
  }

  for (const detailButton of appElement.querySelectorAll('button[data-detail-key]')) {
    detailButton.addEventListener('click', () => {
      openIssueDetail(detailButton.dataset.detailKey ?? '');
    });
  }
}

function bindExternalLinks() {
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

function handleDashboardAction(action) {
  if (action === 'refresh') {
    refreshDashboard();
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
  loadMockDashboard();
}

function disconnectJira() {
  if (vscodeApi !== null) {
    vscodeApi.postMessage({ type: DISCONNECT_JIRA_MESSAGE_TYPE });
    return;
  }

  applyConnectionState(false, '', 'Jira disconnected.');
}

function refreshDashboard() {
  if (state.connection !== 'connected') {
    state.issues = [];
    state.status = 'Connect Jira before loading assigned tickets.';
    state.tone = 'error';
    render();
    return;
  }

  if (vscodeApi !== null) {
    state.loading = true;
    state.status = 'Refreshing assigned tickets...';
    state.tone = 'info';
    render();
    vscodeApi.postMessage({ type: REFRESH_DASHBOARD_MESSAGE_TYPE });
    return;
  }

  loadMockDashboard();
}

function loadMockDashboard() {
  state.loading = true;
  state.status = 'Refreshing assigned tickets...';
  state.tone = 'info';
  render();
  window.setTimeout(() => {
    state.issues = MOCK_ISSUES;
    state.loading = false;
    state.status = '3 assigned tickets loaded with 3 GitLab merge requests.';
    state.tone = 'success';
    render();
  }, 180);
}

function openIssueDetail(issueKey) {
  const issue = state.issues.find((item) => item.key === issueKey);
  if (issue === undefined) {
    return;
  }

  if (vscodeApi !== null) {
    vscodeApi.postMessage({
      type: OPEN_ISSUE_DETAIL_MESSAGE_TYPE,
      issueKey,
    });
    return;
  }

  window.parent.postMessage(
    {
      type: PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE,
      issue,
    },
    '*',
  );
  state.status = `${issue.key} details opened in the editor preview.`;
  state.tone = 'success';
  render();
}

function handleDashboardLoadingMessage() {
  state.issues = [];
  state.status = 'Refreshing assigned tickets...';
  state.tone = 'info';
  state.loading = true;
  render();
}

function handleDashboardLoadedMessage(message) {
  const issues = Array.isArray(message.issues) ? message.issues.filter(isDashboardIssue) : [];
  const mrCount = issues.reduce((total, issue) => total + issue.mergeRequests.length, 0);
  state.issues = issues;
  state.status =
    issues.length === 0
      ? 'No assigned tickets found.'
      : `${String(issues.length)} assigned tickets loaded with ${String(mrCount)} GitLab merge requests.`;
  state.tone = issues.length === 0 ? 'info' : 'success';
  state.loading = false;
  render();
}

function handleDashboardErrorMessage(message) {
  if (state.connection === 'connecting') {
    state.connection = 'disconnected';
    state.cloudName = '';
  }

  state.issues = [];
  state.status =
    typeof message.message === 'string' && message.message.length > 0
      ? message.message
      : 'Assigned tickets could not be loaded.';
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
    state.issues = [];
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

function formatUpdated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
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

function isDashboardIssue(value) {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.status === 'string' &&
    typeof value.statusCategory === 'string' &&
    typeof value.priority === 'string' &&
    typeof value.updated === 'string' &&
    Array.isArray(value.mergeRequests) &&
    value.mergeRequests.every(isMergeRequestLink) &&
    Array.isArray(value.webLinks) &&
    value.webLinks.every(isRemoteWebLink)
  );
}

function isMergeRequestLink(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    typeof value.host === 'string' &&
    typeof value.projectPath === 'string' &&
    typeof value.iid === 'string'
  );
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
