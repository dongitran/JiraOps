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
const NOTIFICATIONS_CHANGED_MESSAGE_TYPE = 'jiraOps.notificationsChanged';
const SETTINGS_CHANGED_MESSAGE_TYPE = 'jiraOps.settingsChanged';
const UPDATE_SETTINGS_MESSAGE_TYPE = 'jiraOps.updateSettings';
const CLEAR_NOTIFICATIONS_MESSAGE_TYPE = 'jiraOps.clearNotifications';
const OPEN_NOTIFICATIONS_MESSAGE_TYPE = 'jiraOps.openNotifications';
const PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE = 'jiraOps.prototypeOpenIssueDetail';
const PROTOTYPE_DETAIL_LOADING_MESSAGE_TYPE = 'jiraOps.prototypeIssueDetailLoading';

const SAMPLE_IMAGE_URI = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1902" height="653" viewBox="0 0 1902 653">
  <rect width="1902" height="653" fill="#1e1e1e"/>
  <rect x="76" y="72" width="1750" height="500" rx="18" fill="#252526" stroke="#2aa198" stroke-width="6"/>
  <path d="M148 468 410 224l210 172 172-128 300 184 214-248 420 286" fill="none" stroke="#7bd88f" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="1560" cy="150" r="72" fill="#d7ba7d"/>
  <text x="148" y="152" fill="#e7e7e7" font-family="Arial, sans-serif" font-size="56" font-weight="700">Full-resolution Jira attachment preview</text>
  <text x="148" y="232" fill="#c8c8c8" font-family="Arial, sans-serif" font-size="34">Original media content stays sharp when Details expands the image.</text>
</svg>
`)}`;

const MOCK_ISSUES = [
  {
    key: 'OPS-123',
    issueType: 'Bug',
    summary: 'Stabilize payment reconciliation alerts',
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'High',
    updated: '2026-05-01T08:20:00.000Z',
    description:
      'Reconciliation alerts fire too late when settlement batches arrive after the normal processing window. Tighten thresholds and keep on-call context visible.',
    descriptionHtml:
      `<h3>Alert behavior</h3><p>Reconciliation alerts fire too late when settlement batches arrive after the normal processing window.</p><figure class="jira-adf-media jira-adf-media-single" data-layout="center"><img src="${SAMPLE_IMAGE_URI}" alt="reconciliation-alert-preview.png" width="1902" height="653" loading="lazy" data-lightbox="true" /></figure><ul><li>Tighten the delayed settlement threshold.</li><li>Keep the on-call runbook visible for reviewers.</li></ul><table><tr><th>Signal</th><th>Current</th><th>Target</th></tr><tr><td>Delayed settlements</td><td>15 minutes</td><td>8 minutes</td></tr><tr><td>Retry budget</td><td>4 attempts</td><td>3 attempts</td></tr></table><p>Review the <a href="https://docs.example.com/runbooks/payments/reconciliation">payment incident runbook</a> before merging.</p><h3>Test Strategy</h3><p>Run checkout and reconciliation regression before moving the alert threshold.</p>`,
    technicalNotesHtml:
      '<p>The payment processor can emit duplicate settlement callbacks after regional failover. Keep the idempotency guard before changing alert thresholds.</p><ul><li>Do not alert while the retry budget is still active.</li><li>Keep a manual override in the runbook for settlement holidays.</li><li>Coordinate the dashboard annotation with the observability owner.</li><li>Confirm that the batch monitor excludes sandbox merchants.</li><li>Backfill the previous 24 hours before enabling the tighter threshold.</li><li>Leave the legacy metric in place until the release train closes.</li><li>Notify support before cutting over the paging policy.</li><li>Capture before-and-after alert counts in the release note.</li><li>Keep the rollback threshold documented for the on-call engineer.</li><li>Verify downstream reporting jobs after the first live settlement batch.</li></ul>',
    activityHtml:
      '<p>Current User moved the ticket into review after validating the alert threshold plan.</p>',
    transitions: [
      {
        id: '31',
        name: 'Send to Review',
        toStatus: 'Code Review',
      },
      {
        id: '41',
        name: 'Resolve',
        toStatus: 'Done',
      },
    ],
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
        mimeType: 'application/octet-stream',
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
        title: 'Merge request - TOR-45',
        url: 'https://gitlab.dongtran.com/group-a/folder/main/repository-1/-/merge_requests/100',
        host: 'gitlab.dongtran.com',
        projectPath: 'group-a/folder/main/repository-1',
        iid: '100',
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
    issueType: 'Task',
    summary: 'Review checkout service release readiness',
    status: 'Code Review',
    statusCategory: 'In Progress',
    priority: 'Medium',
    updated: '2026-05-01T06:05:00.000Z',
    description:
      'Confirm the checkout release has rollout toggles, rollback notes, and deployment observability before approving the release MR.',
    technicalNotesHtml: '',
    activityHtml: '',
    transitions: [
      {
        id: '31',
        name: 'Approve',
        toStatus: 'Done',
      },
    ],
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
    issueType: 'Task',
    summary: 'Follow cloned inventory reservation cleanup',
    status: 'In Review',
    statusCategory: 'In Progress',
    priority: 'High',
    updated: '2026-05-01T05:15:00.000Z',
    description:
      'This ticket tracks the cloned inventory cleanup task. The active implementation MR is attached to the cloned work item.',
    technicalNotesHtml: '',
    activityHtml: '',
    transitions: [
      {
        id: '21',
        name: 'Start Progress',
        toStatus: 'In Progress',
      },
    ],
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
        key: 'OPS-333',
        relationship: 'clones',
        status: 'In Review',
      },
    ],
    mergeRequests: [],
    cloneMergeRequests: [
      {
        id: 'ops-333-mr-91',
        issueKey: 'OPS-333',
        relationship: 'clones',
        title: 'Clean stale inventory reservations',
        url: 'https://gitlab.example.com/storefront/inventory/-/merge_requests/91',
        host: 'gitlab.example.com',
        projectPath: 'storefront/inventory',
        iid: '91',
      },
      {
        id: 'ops-333-mr-92',
        issueKey: 'OPS-333',
        relationship: 'clones',
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
    issueType: 'Task',
    summary: 'demoABCDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    status: 'To Do',
    statusCategory: 'To Do',
    priority: 'Medium',
    updated: '2026-05-01T04:45:00.000Z',
    description:
      'A compact layout test ticket with a single long token in the summary. The title must stay inside the sidebar card.',
    technicalNotesHtml: '',
    activityHtml: '',
    transitions: [],
    comments: [],
    attachments: [],
    linkedCloneIssues: [],
    mergeRequests: [],
    cloneMergeRequests: [],
    webLinks: [],
  },
  {
    key: 'OPS-789',
    issueType: 'Task',
    summary: 'Confirm warehouse webhook retry policy',
    status: 'Waiting for Input',
    statusCategory: 'To Do',
    priority: 'Low',
    updated: '2026-04-30T17:45:00.000Z',
    description:
      'Verify the retry schedule, dead-letter routing, and alert escalation path for warehouse webhook failures.',
    technicalNotesHtml: '',
    activityHtml: '',
    transitions: [
      {
        id: '11',
        name: 'Start Work',
        toStatus: 'In Progress',
      },
    ],
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

const MOCK_NOTIFICATIONS = [
  {
    id: 'ops-123-2026-05-01T08-24',
    issueKey: 'OPS-123',
    title: 'Current User updated Bug OPS-123',
    detail: 'Logged work · Stabilize payment reconciliation alerts',
    updated: '2026-05-01T08:24:00.000Z',
    unread: true,
  },
  {
    id: 'ops-456-2026-05-01T08-18',
    issueKey: 'OPS-456',
    title: 'New Task assigned: OPS-456',
    detail: 'Review checkout service release readiness',
    updated: '2026-05-01T08:18:00.000Z',
    unread: true,
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
  notifications: [],
  notificationSettings: {
    enabled: true,
    intervalMinutes: 1,
  },
  intervalDraft: '1',
  pollStatus: 'Notification polling is ready.',
  cachedIssueKeys: [],
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

  if (event.data.type === NOTIFICATIONS_CHANGED_MESSAGE_TYPE) {
    handleNotificationsChangedMessage(event.data);
    return;
  }

  if (event.data.type === SETTINGS_CHANGED_MESSAGE_TYPE) {
    handleSettingsChangedMessage(event.data);
    return;
  }

  if (event.data.type === OPEN_SETTINGS_MESSAGE_TYPE) {
    openSettingsScreen();
  }
});

function render() {
  appElement.innerHTML = `
    <section class="jira-shell" aria-label="JiraOps workspace">
      ${renderCurrentScreen()}
    </section>
  `;

  bindConnectionButtons();
  bindNavigationButtons();
  bindDashboardButtons();
  bindNotificationButtons();
  bindSettingsControls();
  bindExternalLinks();
  postPrototypeConnectionState();
}

function renderCurrentScreen() {
  if (state.screen === 'settings') {
    return renderSettingsScreen();
  }

  if (state.screen === 'notifications') {
    return renderNotificationsScreen();
  }

  return renderHomeScreen();
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
        <div class="settings-connection-row">
          <div class="settings-connection-copy">
            <strong>Connection</strong>
            <span>${escapeHtml(state.cloudName || 'Jira Cloud')}</span>
          </div>
          <div class="settings-connection-actions">
            <span class="connection-state" data-state="${escapeAttribute(state.connection)}">${escapeHtml(renderConnectionPillText())}</span>
            ${renderSettingsActionButton()}
          </div>
        </div>
      </section>
      ${renderNotificationSettings()}
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

function renderNotificationSettings() {
  const checked = state.notificationSettings.enabled ? ' checked' : '';

  return `
    <section class="settings-notifications" aria-label="Notification polling settings">
      <div class="settings-section-title">
        <strong>Assigned Issue Updates</strong>
        <span>${escapeHtml(state.pollStatus)}</span>
      </div>
      <label class="settings-check-row">
        <input data-setting-control="enabled" name="jiraops-notifications-enabled" type="checkbox"${checked} />
        <span>Poll Jira for assigned issue updates</span>
      </label>
      <label class="settings-field" for="jiraops-notification-interval">
        <span class="settings-field-heading">
          <span>Poll interval</span>
          <small>Minutes, 1 to 60</small>
        </span>
        <input
          id="jiraops-notification-interval"
          data-setting-control="interval"
          name="jiraops-notification-interval"
          type="number"
          min="1"
          max="60"
          inputmode="numeric"
          autocomplete="off"
          value="${escapeAttribute(state.intervalDraft)}"
        />
      </label>
      <div class="settings-row">
        <span class="settings-hint">Applies to assigned issue update checks.</span>
        <button class="settings-save-button" data-settings-action="save" type="button">Save Settings</button>
      </div>
    </section>
  `;
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
        <strong>Assigned to me (${String(issueCount)})</strong>
      </div>
      <div class="dashboard-actions">
        ${renderNotificationButton()}
        <button class="refresh-button" data-dashboard-action="refresh" type="button"${disabled ? ' disabled' : ''}>${state.loading ? 'Refreshing...' : 'Refresh'}</button>
      </div>
    </section>
  `;
}

function renderNotificationButton() {
  const unreadCount = getUnreadNotificationCount();
  const label =
    unreadCount === 0
      ? 'Open notifications'
      : `Open notifications, ${String(unreadCount)} unread`;

  return `
    <button class="notification-button" data-notification-action="open" type="button" aria-label="${escapeAttribute(label)}" title="Notifications">
      <span class="notification-mark" aria-hidden="true"></span>
      ${unreadCount > 0 ? `<span class="notification-count">${String(unreadCount)}</span>` : ''}
    </button>
  `;
}

function renderNotificationsScreen() {
  return `
    <section class="notifications-page" aria-label="JiraOps notifications">
      <div class="settings-heading">
        <button class="back-button" data-nav-action="home" type="button" aria-label="Back to dashboard" title="Back to dashboard">
          <span aria-hidden="true">&#8592;</span>
        </button>
        <div class="settings-title">
          <h2>Notifications</h2>
        </div>
      </div>
      <div class="notification-summary" role="status">
        <strong>${String(getUnreadNotificationCount())} unread</strong>
        <button class="clear-notifications-button" data-notification-action="clear" type="button"${getUnreadNotificationCount() === 0 ? ' disabled' : ''}>Clear</button>
      </div>
      ${renderNotificationList()}
    </section>
  `;
}

function renderNotificationList() {
  if (state.notifications.length === 0) {
    return `
      <div class="empty-state notification-empty">
        <strong>No assigned issue updates</strong>
        <span>JiraOps will show updates after the next successful poll.</span>
      </div>
    `;
  }

  return `
    <div class="notification-list">
      ${state.notifications.map((notification) => renderNotificationItem(notification)).join('')}
    </div>
  `;
}

function renderNotificationItem(notification) {
  const unread = notification.unread === true;

  return `
    <article class="notification-item" data-unread="${String(unread)}" aria-label="${escapeAttribute(notification.title)}">
      <div class="notification-copy">
        <strong>${escapeHtml(notification.title)}</strong>
        <span>${escapeHtml(notification.detail)}</span>
        <small>${escapeHtml(formatUpdated(notification.updated))}</small>
      </div>
      <button class="detail-button notification-detail-button" data-notification-action="open-detail" data-detail-key="${escapeAttribute(notification.issueKey)}" type="button">Details</button>
    </article>
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

function bindNotificationButtons() {
  for (const notificationButton of appElement.querySelectorAll('button[data-notification-action]')) {
    notificationButton.addEventListener('click', () => {
      handleNotificationAction(
        notificationButton.dataset.notificationAction ?? '',
        notificationButton.dataset.detailKey ?? '',
      );
    });
  }
}

function bindSettingsControls() {
  const intervalInput = appElement.querySelector('input[data-setting-control="interval"]');
  if (intervalInput instanceof HTMLInputElement) {
    intervalInput.addEventListener('input', () => {
      state.intervalDraft = intervalInput.value;
    });
  }

  const enabledInput = appElement.querySelector('input[data-setting-control="enabled"]');
  if (enabledInput instanceof HTMLInputElement) {
    enabledInput.addEventListener('change', () => {
      state.notificationSettings.enabled = enabledInput.checked;
    });
  }

  for (const settingsButton of appElement.querySelectorAll('button[data-settings-action]')) {
    settingsButton.addEventListener('click', () => {
      handleSettingsAction(settingsButton.dataset.settingsAction ?? '');
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

function handleNotificationAction(action, issueKey) {
  if (action === 'open') {
    openNotificationsScreen();
    return;
  }

  if (action === 'clear') {
    clearUnreadNotifications();
    return;
  }

  if (action === 'open-detail') {
    markIssueNotificationsRead(issueKey);
    openHomeScreen();
    openIssueDetail(issueKey);
  }
}

function handleSettingsAction(action) {
  if (action !== 'save') {
    return;
  }

  saveNotificationSettings();
}

function openSettingsScreen() {
  state.screen = 'settings';
  render();
}

function openNotificationsScreen() {
  state.screen = 'notifications';
  if (state.connection === 'connected' && state.notificationSettings.enabled && state.notifications.length === 0) {
    state.notifications = MOCK_NOTIFICATIONS;
  }
  if (vscodeApi !== null) {
    vscodeApi.postMessage({ type: OPEN_NOTIFICATIONS_MESSAGE_TYPE });
  }
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

  state.notifications = [];
  state.cachedIssueKeys = [];
  state.pollStatus = 'Notification polling is paused.';
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
    if (state.notificationSettings.enabled && state.notifications.length === 0) {
      state.notifications = MOCK_NOTIFICATIONS;
    }
    state.pollStatus = state.notificationSettings.enabled
      ? `Polling every ${String(state.notificationSettings.intervalMinutes)} minute${state.notificationSettings.intervalMinutes === 1 ? '' : 's'}.`
      : 'Notification polling is disabled.';
    state.loading = false;
    state.status = '';
    state.tone = 'success';
    render();
  }, 180);
}

function saveNotificationSettings() {
  const interval = Number.parseInt(state.intervalDraft, 10);
  if (!Number.isInteger(interval) || interval < 1 || interval > 60) {
    state.status = 'Use a polling interval from 1 to 60 minutes.';
    state.tone = 'error';
    render();
    return;
  }

  state.notificationSettings = {
    enabled: state.notificationSettings.enabled,
    intervalMinutes: interval,
  };
  state.intervalDraft = String(interval);
  state.pollStatus = state.notificationSettings.enabled
    ? `Polling every ${String(interval)} minute${interval === 1 ? '' : 's'}.`
    : 'Notification polling is disabled.';
  state.status = 'Notification polling settings saved.';
  state.tone = 'success';

  if (vscodeApi !== null) {
    vscodeApi.postMessage({
      type: UPDATE_SETTINGS_MESSAGE_TYPE,
      notificationsEnabled: state.notificationSettings.enabled,
      pollIntervalMinutes: interval,
    });
  }

  render();
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

  if (state.cachedIssueKeys.includes(issue.key)) {
    window.parent.postMessage(
      {
        type: PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE,
        issue,
        cached: true,
      },
      '*',
    );
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
        cached: false,
      },
      '*',
    );
    state.cachedIssueKeys = [...state.cachedIssueKeys, issue.key];
  }, 240);
}

function clearUnreadNotifications() {
  state.notifications = state.notifications.map((notification) => ({
    ...notification,
    unread: false,
  }));

  if (vscodeApi !== null) {
    vscodeApi.postMessage({ type: CLEAR_NOTIFICATIONS_MESSAGE_TYPE });
  }

  render();
}

function markIssueNotificationsRead(issueKey) {
  state.notifications = state.notifications.map((notification) => ({
    ...notification,
    unread: notification.issueKey === issueKey ? false : notification.unread,
  }));
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

function handleNotificationsChangedMessage(message) {
  state.notifications = Array.isArray(message.notifications)
    ? message.notifications.filter(isNotificationItem)
    : [];
  state.pollStatus =
    typeof message.pollStatus === 'string' && message.pollStatus.length > 0
      ? message.pollStatus
      : state.pollStatus;
  render();
}

function handleSettingsChangedMessage(message) {
  const enabled =
    typeof message.notificationsEnabled === 'boolean'
      ? message.notificationsEnabled
      : state.notificationSettings.enabled;
  const interval =
    typeof message.pollIntervalMinutes === 'number' &&
    Number.isInteger(message.pollIntervalMinutes) &&
    message.pollIntervalMinutes >= 1 &&
    message.pollIntervalMinutes <= 60
      ? message.pollIntervalMinutes
      : state.notificationSettings.intervalMinutes;

  state.notificationSettings = {
    enabled,
    intervalMinutes: interval,
  };
  state.intervalDraft = String(interval);
  render();
}

function applyConnectionState(connected, cloudName, status) {
  state.connection = connected ? 'connected' : 'disconnected';
  state.cloudName = connected ? cloudName : '';
  state.status = status;
  state.tone = connected ? 'success' : 'info';
  state.loading = false;
  if (!connected) {
    state.issues = [];
    state.notifications = [];
    state.cachedIssueKeys = [];
  }
  render();
}

function getUnreadNotificationCount() {
  return state.notifications.filter((notification) => notification.unread === true).length;
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

function isNotificationItem(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.issueKey === 'string' &&
    typeof value.title === 'string' &&
    typeof value.detail === 'string' &&
    typeof value.updated === 'string' &&
    typeof value.unread === 'boolean'
  );
}
