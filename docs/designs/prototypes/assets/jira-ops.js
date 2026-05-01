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
const PROTOTYPE_DETAIL_LOADING_MESSAGE_TYPE = 'jiraOps.prototypeIssueDetailLoading';

const SAMPLE_IMAGE_URI = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#1e1e1e"/>
  <rect x="44" y="48" width="552" height="264" rx="10" fill="#252526" stroke="#2aa198" stroke-width="3"/>
  <path d="M90 242 208 138l82 78 72-55 188 116" fill="none" stroke="#7bd88f" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="492" cy="104" r="36" fill="#d7ba7d"/>
  <text x="88" y="92" fill="#e7e7e7" font-family="Arial, sans-serif" font-size="24" font-weight="700">Jira attachment preview</text>
</svg>
`)}`;

const MOCK_ISSUES = [
  {
    key: 'OPS-123',
    summary: 'Stabilize payment reconciliation alerts',
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'High',
    updated: '2026-05-01T08:20:00.000Z',
    description:
      'Reconciliation alerts fire too late when settlement batches arrive after the normal processing window. Tighten thresholds and keep on-call context visible.',
    descriptionHtml:
      '<h3>Alert behavior</h3><p>Reconciliation alerts fire too late when settlement batches arrive after the normal processing window.</p><ul><li>Tighten the delayed settlement threshold.</li><li>Keep the on-call runbook visible for reviewers.</li></ul><p>Review the <a href="https://docs.example.com/runbooks/payments/reconciliation">payment incident runbook</a> before merging.</p>',
    comments: [
      {
        id: 'ops-123-comment-1',
        author: 'Current User',
        body: 'Validated against the delayed settlement sample. The alert should page only after the retry budget is exhausted.',
        bodyHtml:
          '<p>Validated against the delayed settlement sample.</p><p><strong>Expected:</strong> page only after the retry budget is exhausted.</p>',
        created: '2026-05-01T07:55:00.000Z',
      },
    ],
    attachments: [
      {
        id: 'ops-123-image-1',
        filename: 'reconciliation-alert-preview.png',
        mimeType: 'image/png',
        size: 28420,
        imageDataUri: SAMPLE_IMAGE_URI,
      },
    ],
    linkedCloneIssues: [
      {
        key: 'OPS-111',
        relationship: 'clones',
        status: 'Code Review',
      },
    ],
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
    cloneMergeRequests: [
      {
        id: 'ops-111-mr-88',
        issueKey: 'OPS-111',
        relationship: 'clones',
        title: 'Backport alert window tuning',
        url: 'https://gitlab.example.com/platform/observability/-/merge_requests/88',
        host: 'gitlab.example.com',
        projectPath: 'platform/observability',
        iid: '88',
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
    description:
      'Confirm the checkout release has rollout toggles, rollback notes, and deployment observability before approving the release MR.',
    comments: [],
    attachments: [],
    linkedCloneIssues: [],
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
    cloneMergeRequests: [],
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
    key: 'OPS-321',
    summary: 'Follow cloned inventory reservation cleanup',
    status: 'In Review',
    statusCategory: 'In Progress',
    priority: 'High',
    updated: '2026-05-01T05:15:00.000Z',
    description:
      'This ticket tracks the cloned inventory cleanup task. The active implementation MR is attached to the cloned work item.',
    comments: [
      {
        id: 'ops-321-comment-1',
        author: 'Release Manager',
        body: 'Keep this ticket open until the cloned cleanup MR is merged and the reservation job is verified.',
        created: '2026-05-01T05:40:00.000Z',
      },
    ],
    attachments: [],
    linkedCloneIssues: [
      {
        key: 'OPS-222',
        relationship: 'is cloned by',
        status: 'In Review',
      },
    ],
    mergeRequests: [],
    cloneMergeRequests: [
      {
        id: 'ops-222-mr-91',
        issueKey: 'OPS-222',
        relationship: 'is cloned by',
        title: 'Clean stale inventory reservations',
        url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/91',
        host: 'gitlab.example.com',
        projectPath: 'storefront/inventory',
        iid: '91',
      },
      {
        id: 'ops-222-mr-92',
        issueKey: 'OPS-222',
        relationship: 'is cloned by',
        title: 'Add reservation cleanup observability',
        url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/92',
        host: 'gitlab.example.com',
        projectPath: 'storefront/inventory',
        iid: '92',
      },
    ],
    webLinks: [
      {
        id: 'ops-321-runbook',
        title: 'Inventory reservation runbook',
        url: 'https://docs.example.com/runbooks/inventory/reservations',
        relationship: 'Runbook',
        host: 'docs.example.com',
      },
    ],
  },
  {
    key: 'OPS-900',
    summary: 'demoABCDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    status: 'To Do',
    statusCategory: 'To Do',
    priority: 'Medium',
    updated: '2026-05-01T04:45:00.000Z',
    description:
      'A compact layout test ticket with a single long token in the summary. The title must stay inside the sidebar card.',
    comments: [],
    attachments: [],
    linkedCloneIssues: [],
    mergeRequests: [],
    cloneMergeRequests: [],
    webLinks: [],
  },
  {
    key: 'OPS-789',
    summary: 'Confirm warehouse webhook retry policy',
    status: 'Waiting for Input',
    statusCategory: 'To Do',
    priority: 'Low',
    updated: '2026-04-30T17:45:00.000Z',
    description:
      'Verify the retry schedule, dead-letter routing, and alert escalation path for warehouse webhook failures.',
    comments: [],
    attachments: [],
    linkedCloneIssues: [],
    mergeRequests: [],
    cloneMergeRequests: [],
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
  status: '',
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
    <section class="jira-shell" aria-label="JiraOps workspace">
      ${state.screen === 'settings' ? renderSettingsScreen() : renderHomeScreen()}
    </section>
  `;

  bindConnectionButtons();
  bindNavigationButtons();
  bindDashboardButtons();
  bindExternalLinks();
  postPrototypeConnectionState();
}

function renderHomeScreen() {
  return `
    ${renderDashboardToolbar()}
    ${renderStatusLine()}
    <section class="issues-region" aria-label="Assigned Jira tickets">
      ${renderDashboardContent()}
    </section>
  `;
}

function renderSettingsScreen() {
  return `
    <section class="settings-page" aria-label="JiraOps settings">
      <div class="settings-heading">
        <button class="back-button" data-nav-action="home" type="button" aria-label="Back to dashboard" title="Back to dashboard">
          <span aria-hidden="true">&#8592;</span>
        </button>
        <div class="settings-title">
          <h2>Settings</h2>
        </div>
      </div>
      <section class="settings-connection" aria-label="Jira connection settings">
        <div class="settings-row">
          <strong>Connection</strong>
          <span class="connection-state" data-state="${escapeAttribute(state.connection)}">${escapeHtml(renderConnectionPillText())}</span>
        </div>
        ${renderSettingsActionButton()}
      </section>
      ${renderStatusLine()}
    </section>
  `;
}

function renderSettingsActionButton() {
  const connected = state.connection === 'connected';
  const connecting = state.connection === 'connecting';
  const action = connected ? 'disconnect' : 'connect';
  const buttonText = connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect Jira';
  const variant = connected ? 'secondary' : 'primary';

  return `<button class="connection-button" data-variant="${variant}" data-connection-action="${action}" type="button"${connecting ? ' disabled' : ''}>${escapeHtml(buttonText)}</button>`;
}

function renderStatusLine() {
  if (state.status.length === 0) {
    return '';
  }

  return `<p class="status-line" role="status" data-tone="${state.tone}">${escapeHtml(state.status)}</p>`;
}

function renderDashboardToolbar() {
  const issueCount = state.issues.length;
  const disabled = state.loading || state.connection !== 'connected';

  return `
    <section class="dashboard-toolbar" aria-label="Assigned ticket actions">
      <div class="dashboard-title">
        <span class="dashboard-eyebrow">Assigned to me</span>
        <strong>${String(issueCount)} tickets</strong>
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

  return `<div class="issue-list">${state.issues.map((issue) => renderIssueCard(issue)).join('')}</div>`;
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
      : 'The dashboard loads assigned tickets after Jira is connected.';
  const action =
    state.connection === 'disconnected'
      ? '<button class="connection-button empty-action" data-variant="primary" data-connection-action="connect" type="button">Connect Jira</button>'
      : '';

  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
      ${action}
    </div>
  `;
}

function renderIssueCard(issue) {
  return `
    <article class="issue-card" aria-label="${escapeAttribute(issue.key)} assigned ticket">
      <div class="issue-card-header">
        <div class="issue-heading">
          <span class="issue-key">${escapeHtml(issue.key)}</span>
          <h2 title="${escapeAttribute(issue.summary)}">${escapeHtml(formatIssueSummary(issue.summary))}</h2>
        </div>
        <button class="detail-button" data-detail-key="${escapeAttribute(issue.key)}" type="button">Details</button>
      </div>
      <div class="issue-meta-row" aria-label="${escapeAttribute(issue.key)} metadata">
        <span class="issue-meta-status status-chip" data-category="${escapeAttribute(issue.statusCategory)}">${escapeHtml(issue.status)}</span>
        <span class="issue-meta-priority">${escapeHtml(issue.priority)}</span>
        <span class="issue-meta-updated">${escapeHtml(formatUpdated(issue.updated))}</span>
      </div>
    </article>
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
  if (action === 'home') {
    openHomeScreen();
  }
}

function handleDashboardAction(action) {
  if (action === 'refresh') {
    refreshDashboard();
  }
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

  applyConnectionState(true, 'Example Jira', '');
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
    state.status = '';
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
      type: PROTOTYPE_DETAIL_LOADING_MESSAGE_TYPE,
      issueKey: issue.key,
      summary: issue.summary,
    },
    '*',
  );
  window.setTimeout(() => {
    window.parent.postMessage(
      {
        type: PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE,
        issue,
      },
      '*',
    );
  }, 240);
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
  state.issues = issues;
  state.status = issues.length === 0 ? 'No assigned tickets found.' : '';
  state.tone = 'info';
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
  const fallback = connected ? '' : 'Jira disconnected.';
  const status = typeof message.message === 'string' ? message.message : fallback;
  applyConnectionState(connected, cloudName, connected ? '' : status);
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

function postPrototypeConnectionState() {
  window.parent.postMessage(
    {
      type: 'jiraOps.prototypeConnectionState',
      connected: state.connection === 'connected',
      connecting: state.connection === 'connecting',
    },
    '*',
  );
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

function formatIssueSummary(summary) {
  return String(summary)
    .split(/(\s+)/u)
    .map((part) => (part.trim().length > 26 ? `${part.slice(0, 23)}...` : part))
    .join('');
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
    Array.isArray(value.cloneMergeRequests) &&
    value.cloneMergeRequests.every(isCloneMergeRequestLink) &&
    Array.isArray(value.linkedCloneIssues) &&
    value.linkedCloneIssues.every(isLinkedCloneIssue) &&
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

function isCloneMergeRequestLink(value) {
  return (
    isMergeRequestLink(value) &&
    typeof value.issueKey === 'string' &&
    typeof value.relationship === 'string'
  );
}

function isLinkedCloneIssue(value) {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.relationship === 'string'
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
