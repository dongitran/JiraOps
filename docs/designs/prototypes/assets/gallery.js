const frameElement = document.getElementById('prototype-frame');
const themeButton = document.getElementById('theme-cycle');
const controlsToggle = document.getElementById('controls-toggle');
const controlsPanel = document.getElementById('floating-controls-panel');
const editorSurface = document.querySelector('.editor-surface');
const connectionStateElement = document.getElementById('prototype-connection-state');
const settingsButton = document.querySelector('.prototype-settings-button');
const OPEN_SETTINGS_MESSAGE_TYPE = 'jiraOps.openSettings';
const PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE = 'jiraOps.prototypeOpenIssueDetail';
const PROTOTYPE_DETAIL_LOADING_MESSAGE_TYPE = 'jiraOps.prototypeIssueDetailLoading';
const PROTOTYPE_CONNECTION_STATE_MESSAGE_TYPE = 'jiraOps.prototypeConnectionState';

const THEMES = [
  {
    id: 'dark',
    galleryClass: 'gallery-theme-dark',
    frameClass: 'vscode-dark',
    buttonLabel: 'Theme: Dark',
  },
  {
    id: 'light',
    galleryClass: 'gallery-theme-light',
    frameClass: 'vscode-light',
    buttonLabel: 'Theme: Light',
  },
  {
    id: 'high-contrast',
    galleryClass: 'gallery-theme-high-contrast',
    frameClass: 'vscode-high-contrast',
    buttonLabel: 'Theme: High Contrast',
  },
];

if (
  !(frameElement instanceof HTMLIFrameElement) ||
  !(themeButton instanceof HTMLButtonElement) ||
  !(controlsToggle instanceof HTMLButtonElement) ||
  !(controlsPanel instanceof HTMLDivElement) ||
  !(editorSurface instanceof HTMLElement) ||
  !(connectionStateElement instanceof HTMLElement) ||
  !(settingsButton instanceof HTMLButtonElement)
) {
  throw new Error('Prototype gallery is missing required DOM nodes.');
}

let currentThemeIndex = 0;
let controlsOpen = false;

frameElement.addEventListener('load', () => {
  applyThemeToFrame();
});

themeButton.addEventListener('click', () => {
  currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
  applyThemeToGallery();
  applyThemeToFrame();
});

controlsToggle.addEventListener('click', () => {
  setControlsOpen(!controlsOpen);
});

settingsButton.addEventListener('click', () => {
  frameElement.contentWindow?.postMessage({ type: OPEN_SETTINGS_MESSAGE_TYPE }, '*');
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && controlsOpen) {
    setControlsOpen(false);
  }
});

window.addEventListener('message', (event) => {
  if (!isRecord(event.data)) {
    return;
  }

  if (event.data.type === PROTOTYPE_CONNECTION_STATE_MESSAGE_TYPE) {
    updateConnectionState(event.data);
    return;
  }

  if (event.data.type === PROTOTYPE_DETAIL_LOADING_MESSAGE_TYPE) {
    renderIssueDetailLoading(event.data);
    return;
  }

  if (event.data.type === PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE && isIssueDetail(event.data.issue)) {
    renderIssueDetail({
      ...event.data.issue,
      cached: event.data.cached === true,
    });
  }
});

applyThemeToGallery();
setControlsOpen(false);
renderWhatsNewPanel();
updateConnectionState({ connected: false });

function applyThemeToGallery() {
  const theme = THEMES[currentThemeIndex];
  if (theme === undefined) {
    return;
  }

  for (const item of THEMES) {
    document.body.classList.toggle(item.galleryClass, item.id === theme.id);
  }
  themeButton.textContent = theme.buttonLabel;
}

function applyThemeToFrame() {
  const frameBody = frameElement.contentDocument?.body;
  const theme = THEMES[currentThemeIndex];
  if (frameBody === undefined || theme === undefined) {
    return;
  }

  for (const item of THEMES) {
    frameBody.classList.toggle(item.frameClass, item.id === theme.id);
  }
}

function setControlsOpen(isOpen) {
  controlsOpen = isOpen;
  controlsPanel.hidden = !isOpen;
  controlsToggle.setAttribute('aria-expanded', String(isOpen));
}

function renderEmptyDetail() {
  editorSurface.innerHTML = `
    <div class="editor-detail-empty">
      <span>Jira Ops Detail</span>
      <strong>Select an assigned ticket</strong>
      <p>Issue details open in a wide editor tab with merge requests first and supporting web links after that.</p>
    </div>
  `;
}

function renderWhatsNewPanel() {
  editorSurface.innerHTML = `
    <article class="editor-whats-new" aria-label="JiraOps release notes">
      <header class="editor-whats-new-header">
        <span>JiraOps 0.1.10 Stable</span>
        <h1>What Is New</h1>
        <p>JiraOps is ready for daily Jira triage: assigned tickets, GitLab merge request context, focused Details, safer Jira auth, and a stable release lane.</p>
      </header>
      <section class="whats-new-hero" aria-label="Stable release summary">
        <div>
          <strong>Stable workspace</strong>
          <p>Open JiraOps, connect Jira, scan assigned work, then inspect the exact issue context in a wide editor tab.</p>
        </div>
        <span>0.1.10</span>
      </section>
      <section class="whats-new-grid" aria-label="Release highlights">
        <article>
          <span>01</span>
          <strong>Assigned-ticket dashboard</strong>
          <p>Load active Jira issues assigned to you with compact cards built for narrow VS Code sidebars.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Wide Details view</strong>
          <p>Open issue descriptions, comments, image attachments, status, priority, and supporting Jira web links in an editor tab.</p>
        </article>
        <article>
          <span>03</span>
          <strong>GitLab MR context</strong>
          <p>Separate direct GitLab merge requests from general web links, and keep clone-linked MRs available inside Details.</p>
        </article>
        <article>
          <span>04</span>
          <strong>Clean Jira connection</strong>
          <p>Use OAuth credentials from environment variables or VS Code SecretStorage without exposing tokens in the UI.</p>
        </article>
        <article>
          <span>05</span>
          <strong>Native VS Code polish</strong>
          <p>Connection state lives in the native view header, while Settings keeps disconnect and credential cleanup workflows out of the main dashboard.</p>
        </article>
        <article>
          <span>06</span>
          <strong>Stable release lane</strong>
          <p>Version 0.1.10 is the stable Marketplace release. Experimental pre-release work stays outside this What Is New panel.</p>
        </article>
      </section>
    </article>
  `;
}

function updateConnectionState(message) {
  const connected = message.connected === true;
  const connecting = message.connecting === true;
  connectionStateElement.textContent = connecting
    ? 'Connecting'
    : connected
      ? 'Connected'
      : 'Not connected';
}

function renderIssueDetailLoading(message) {
  const issueKey = typeof message.issueKey === 'string' ? message.issueKey : 'Issue';
  const summary = typeof message.summary === 'string' ? message.summary : 'Loading issue details';

  editorSurface.innerHTML = `
    <article class="editor-detail-loading" aria-label="${escapeAttribute(issueKey)} details">
      <div class="detail-loading-indicator" role="status">
        <span class="detail-loading-spinner" aria-hidden="true"></span>
        <strong>${escapeHtml(issueKey)}</strong>
        <p>${escapeHtml(summary)}</p>
      </div>
    </article>
  `;
}

function renderIssueDetail(issue) {
  editorSurface.innerHTML = `
    <article class="editor-detail" aria-label="${escapeAttribute(issue.key)} details">
      <header class="editor-detail-header">
        <div>
          <span class="detail-key">${escapeHtml(issue.key)}</span>
          <h1 title="${escapeAttribute(issue.summary)}">${escapeHtml(issue.summary)}</h1>
        </div>
        ${renderDetailHeaderActions(issue)}
      </header>
      <section class="detail-section detail-content-section" aria-label="Description and comments">
        ${renderIssueContent(issue)}
      </section>
      <section class="detail-section" aria-label="GitLab merge requests">
        <div class="detail-section-heading">
          <h2>GitLab merge requests</h2>
          <span>${String(issue.mergeRequests.length)}</span>
        </div>
        ${renderMergeRequests(issue.mergeRequests)}
      </section>
      <section class="detail-section" aria-label="Clone merge requests">
        <div class="detail-section-heading">
          <h2>Clone merge requests</h2>
          <span>${String(issue.cloneMergeRequests.length)}</span>
        </div>
        ${renderCloneMergeRequests(issue.cloneMergeRequests)}
      </section>
      <section class="detail-section" aria-label="All Jira web links">
        <div class="detail-section-heading">
          <h2>All Jira web links</h2>
          <span>${String(issue.webLinks.length)}</span>
        </div>
        ${renderWebLinks(issue.webLinks)}
      </section>
      ${renderTechnicalNotesSection(issue)}
      <section class="detail-section" aria-label="Attachments" data-detail-section="attachments">
        <div class="detail-section-heading">
          <h2>Attachments</h2>
          <span>${String(issue.attachments.length)}</span>
        </div>
        ${renderAttachments(issue.attachments)}
      </section>
      ${renderWorklogDialog(issue)}
    </article>
  `;
  bindDetailActions(issue);
}

function renderDetailHeaderActions(issue) {
  return `
    <div class="detail-header-actions" aria-label="Issue actions">
      <label class="detail-status-control">
        <span class="visually-hidden">Issue status</span>
        <select name="transition" aria-label="Issue status" data-detail-status-select ${issue.transitions.length === 0 ? 'disabled' : ''}>
          ${renderTransitionOptions(issue.status, issue.transitions)}
        </select>
      </label>
      <button class="detail-log-work-button" type="button" data-detail-action="open-worklog">Log Work</button>
      <p class="detail-action-status" role="status" aria-live="polite"></p>
    </div>
  `;
}

function renderTransitionOptions(currentStatus, transitions) {
  const current = `<option value="" data-status="${escapeAttribute(currentStatus)}" selected>${escapeHtml(currentStatus)}</option>`;
  if (transitions.length === 0) {
    return current;
  }

  const transitionOptions = transitions
    .map((transition) => {
      return `<option value="${escapeAttribute(transition.id)}" data-status="${escapeAttribute(transition.toStatus)}">${escapeHtml(transition.toStatus)}</option>`;
    })
    .join('');
  return `${current}${transitionOptions}`;
}

function renderWorklogDialog(issue) {
  return `
    <dialog class="detail-worklog-dialog" aria-label="Log Work">
      <form class="detail-worklog-form" data-detail-action="work" data-issue-key="${escapeAttribute(issue.key)}">
        <div class="detail-dialog-heading">
          <div>
            <span>${escapeHtml(issue.key)}</span>
            <h2>Log Work</h2>
          </div>
          <button type="button" class="detail-dialog-close" data-detail-action="close-worklog" aria-label="Close Log Work">&times;</button>
        </div>
        <label>
          <span>Minutes</span>
          <input name="minutes" type="number" min="1" max="1440" inputmode="numeric" autocomplete="off" value="30" />
        </label>
        <label>
          <span>Note</span>
          <textarea name="note" rows="4" autocomplete="off" placeholder="Add a short work note…"></textarea>
        </label>
        <p class="detail-dialog-status" role="status" aria-live="polite"></p>
        <div class="detail-dialog-actions">
          <button type="button" class="detail-dialog-secondary" data-detail-action="close-worklog">Cancel</button>
          <button type="submit" class="detail-dialog-primary">Log Work</button>
        </div>
      </form>
    </dialog>
  `;
}

function renderTechnicalNotesSection(issue) {
  if (typeof issue.technicalNotesHtml !== 'string' || issue.technicalNotesHtml.length === 0) {
    return '';
  }

  return `
    <section class="detail-section" aria-label="Technical notes" data-detail-section="technical-notes">
      <div class="detail-section-heading">
        <h2>Technical notes</h2>
      </div>
      <div class="detail-technical-notes jira-adf-content">
        ${issue.technicalNotesHtml}
      </div>
    </section>
  `;
}

function renderIssueContent(issue) {
  const description =
    typeof issue.descriptionHtml === 'string' && issue.descriptionHtml.length > 0
      ? issue.descriptionHtml
      : `<p>${escapeHtml(resolvePlainDescription(issue))}</p>`;

  return `
    <div class="detail-content jira-adf-content">
      ${description}
      ${renderComments(issue.comments)}
    </div>
  `;
}

function resolvePlainDescription(issue) {
  return typeof issue.description === 'string' && issue.description.length > 0
    ? issue.description
    : 'No description was found for this issue.';
}

function renderComments(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return '<p class="detail-muted">No comments were found for this issue.</p>';
  }

  return `
    <div class="detail-comment-list">
      ${comments
        .map((comment) => {
          return `
            <article class="detail-comment">
              <div class="detail-comment-meta">
                <strong>${escapeHtml(comment.author)}</strong>
                <span>${escapeHtml(formatUpdated(comment.created))}</span>
              </div>
              <div class="jira-adf-content">${renderCommentBody(comment)}</div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderCommentBody(comment) {
  if (typeof comment.bodyHtml === 'string' && comment.bodyHtml.length > 0) {
    return comment.bodyHtml;
  }

  return `<p>${escapeHtml(comment.body)}</p>`;
}

function renderMergeRequests(mergeRequests) {
  if (mergeRequests.length === 0) {
    return '<p class="detail-muted">No GitLab merge requests were found for this issue.</p>';
  }

  return `
    <div class="detail-grid">
      ${mergeRequests
        .map((mergeRequest) => {
          return `
            <a class="detail-link detail-link-primary" href="${escapeAttribute(mergeRequest.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(mergeRequest.title)}</strong>
              <span>${escapeHtml(mergeRequest.projectPath)} !${escapeHtml(mergeRequest.iid)}</span>
            </a>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderCloneMergeRequests(mergeRequests) {
  if (mergeRequests.length === 0) {
    return '<p class="detail-muted">No GitLab merge requests were found on cloned Jira work items.</p>';
  }

  return `
    <div class="detail-grid">
      ${mergeRequests
        .map((mergeRequest) => {
          return `
            <a class="detail-link detail-link-primary" href="${escapeAttribute(mergeRequest.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(mergeRequest.title)}</strong>
              <span>Clone ticket ${escapeHtml(mergeRequest.issueKey)} - ${escapeHtml(mergeRequest.projectPath)} !${escapeHtml(mergeRequest.iid)}</span>
            </a>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderWebLinks(webLinks) {
  if (webLinks.length === 0) {
    return '<p class="detail-muted">No Jira remote web links were found for this issue.</p>';
  }

  return `
    <div class="detail-grid">
      ${webLinks
        .map((webLink) => {
          return `
            <a class="detail-link" href="${escapeAttribute(webLink.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(webLink.title)}</strong>
              <span>${escapeHtml(webLink.relationship)} - ${escapeHtml(webLink.host)}</span>
            </a>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return '<p class="detail-muted">No attachments were found for this issue.</p>';
  }

  return `
    <div class="attachment-grid">
      ${attachments
        .map((attachment) => {
          const image =
            typeof attachment.imageDataUri === 'string' && attachment.imageDataUri.length > 0
              ? `<img src="${escapeAttribute(attachment.imageDataUri)}" alt="${escapeAttribute(attachment.filename)}" />`
              : '';
          return `
            <article class="attachment-card">
              ${image}
              <div class="attachment-meta">
                <strong>${escapeHtml(attachment.filename)}</strong>
                <span>${escapeHtml(attachment.mimeType)}</span>
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function bindDetailActions(issue) {
  const statusSelect = editorSurface.querySelector('[data-detail-status-select]');
  if (statusSelect instanceof HTMLSelectElement) {
    statusSelect.addEventListener('change', () => {
      applyPrototypeStatusTransition(statusSelect, issue);
    });
  }

  const worklogButton = editorSurface.querySelector('[data-detail-action="open-worklog"]');
  if (worklogButton instanceof HTMLButtonElement) {
    worklogButton.addEventListener('click', openPrototypeWorklogDialog);
  }

  for (const closeButton of editorSurface.querySelectorAll('[data-detail-action="close-worklog"]')) {
    closeButton.addEventListener('click', closePrototypeWorklogDialog);
  }

  const workForm = editorSurface.querySelector('form[data-detail-action="work"]');
  if (workForm instanceof HTMLFormElement) {
    workForm.addEventListener('submit', (event) => {
      event.preventDefault();
      applyPrototypeWorkLog(workForm);
    });
  }
}

function applyPrototypeStatusTransition(select, issue) {
  if (select.selectedOptions.length === 0 || select.value.length === 0) {
    setDetailActionStatus('Choose an available status transition.');
    return;
  }

  const nextStatus = select.selectedOptions[0]?.dataset.status ?? '';
  select.disabled = true;
  setDetailActionStatus('Updating status…');
  issue.status = nextStatus.length > 0 ? nextStatus : issue.status;
  const currentOption = select.querySelector('option[value=""]');
  if (currentOption instanceof HTMLOptionElement) {
    currentOption.textContent = issue.status;
    currentOption.dataset.status = issue.status;
  }
  select.value = '';
  select.disabled = false;
  setDetailActionStatus(`Status changed to ${issue.status}.`);
}

function openPrototypeWorklogDialog() {
  const dialog = editorSurface.querySelector('.detail-worklog-dialog');
  if (!(dialog instanceof HTMLDialogElement)) {
    return;
  }

  setWorklogDialogStatus('');
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
    return;
  }
  dialog.setAttribute('open', '');
}

function closePrototypeWorklogDialog() {
  const dialog = editorSurface.querySelector('.detail-worklog-dialog');
  if (dialog instanceof HTMLDialogElement) {
    dialog.close();
  }
}

function applyPrototypeWorkLog(form) {
  const minutesInput = form.elements.namedItem('minutes');
  const noteInput = form.elements.namedItem('note');
  if (!(minutesInput instanceof HTMLInputElement)) {
    setWorklogDialogStatus('Enter minutes from 1 to 1440.');
    return;
  }

  const minutes = Number.parseInt(minutesInput.value, 10);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    setWorklogDialogStatus('Enter minutes from 1 to 1440.');
    return;
  }

  if (noteInput instanceof HTMLTextAreaElement) {
    noteInput.value = '';
  }
  closePrototypeWorklogDialog();
  setDetailActionStatus(`Logged ${String(minutes)} minute${minutes === 1 ? '' : 's'}.`);
}

function setDetailActionStatus(message) {
  const status = editorSurface.querySelector('.detail-action-status');
  if (status instanceof HTMLElement) {
    status.textContent = message;
  }
}

function setWorklogDialogStatus(message) {
  const status = editorSurface.querySelector('.detail-dialog-status');
  if (status instanceof HTMLElement) {
    status.textContent = message;
  }
}

function isIssueDetail(value) {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.status === 'string' &&
    typeof value.description === 'string' &&
    typeof value.technicalNotesHtml === 'string' &&
    Array.isArray(value.transitions) &&
    value.transitions.every(isIssueTransition) &&
    Array.isArray(value.comments) &&
    value.comments.every(isIssueComment) &&
    Array.isArray(value.attachments) &&
    value.attachments.every(isIssueAttachment) &&
    Array.isArray(value.mergeRequests) &&
    value.mergeRequests.every(isMergeRequestLink) &&
    Array.isArray(value.cloneMergeRequests) &&
    value.cloneMergeRequests.every(isCloneMergeRequestLink) &&
    Array.isArray(value.webLinks) &&
    value.webLinks.every(isRemoteWebLink)
  );
}

function isIssueTransition(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.toStatus === 'string'
  );
}

function isMergeRequestLink(value) {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
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

function isIssueComment(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.author === 'string' &&
    typeof value.body === 'string' &&
    typeof value.created === 'string'
  );
}

function isIssueAttachment(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.filename === 'string' &&
    typeof value.mimeType === 'string'
  );
}

function isRemoteWebLink(value) {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    typeof value.relationship === 'string' &&
    typeof value.host === 'string'
  );
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
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
