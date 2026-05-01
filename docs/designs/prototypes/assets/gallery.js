const frameElement = document.getElementById('prototype-frame');
const themeButton = document.getElementById('theme-cycle');
const controlsToggle = document.getElementById('controls-toggle');
const controlsPanel = document.getElementById('floating-controls-panel');
const editorSurface = document.querySelector('.editor-surface');
const connectionStateElement = document.getElementById('prototype-connection-state');
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
  !(connectionStateElement instanceof HTMLElement)
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
    renderIssueDetail(event.data.issue);
  }
});

applyThemeToGallery();
setControlsOpen(false);
renderEmptyDetail();
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
        <span class="detail-status-line">${escapeHtml(issue.status)}</span>
      </header>
      <section class="detail-section" aria-label="Issue content">
        <div class="detail-section-heading">
          <h2>Issue content</h2>
        </div>
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
      <section class="detail-section" aria-label="Attachments">
        <div class="detail-section-heading">
          <h2>Attachments</h2>
          <span>${String(issue.attachments.length)}</span>
        </div>
        ${renderAttachments(issue.attachments)}
      </section>
    </article>
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
              <span>${escapeHtml(mergeRequest.issueKey)} · ${escapeHtml(mergeRequest.projectPath)} !${escapeHtml(mergeRequest.iid)}</span>
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

function isIssueDetail(value) {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.status === 'string' &&
    typeof value.description === 'string' &&
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
