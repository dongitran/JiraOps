const frameElement = document.getElementById('prototype-frame');
const themeButton = document.getElementById('theme-cycle');
const controlsToggle = document.getElementById('controls-toggle');
const controlsPanel = document.getElementById('floating-controls-panel');
const editorSurface = document.querySelector('.editor-surface');
const PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE = 'jiraOps.prototypeOpenIssueDetail';

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
  !(editorSurface instanceof HTMLElement)
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
  if (!isRecord(event.data) || event.data.type !== PROTOTYPE_OPEN_DETAIL_MESSAGE_TYPE) {
    return;
  }

  if (isIssueDetail(event.data.issue)) {
    renderIssueDetail(event.data.issue);
  }
});

applyThemeToGallery();
setControlsOpen(false);
renderEmptyDetail();

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

function renderIssueDetail(issue) {
  editorSurface.innerHTML = `
    <article class="editor-detail" aria-label="${escapeAttribute(issue.key)} details">
      <header class="editor-detail-header">
        <div>
          <span class="detail-key">${escapeHtml(issue.key)}</span>
          <h1>${escapeHtml(issue.summary)}</h1>
        </div>
        <span class="detail-status">${escapeHtml(issue.status)}</span>
      </header>
      <section class="detail-section" aria-label="GitLab merge requests">
        <div class="detail-section-heading">
          <h2>GitLab merge requests</h2>
          <span>${String(issue.mergeRequests.length)}</span>
        </div>
        ${renderMergeRequests(issue.mergeRequests)}
      </section>
      <section class="detail-section" aria-label="All Jira web links">
        <div class="detail-section-heading">
          <h2>All Jira web links</h2>
          <span>${String(issue.webLinks.length)}</span>
        </div>
        ${renderWebLinks(issue.webLinks)}
      </section>
    </article>
  `;
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

function isIssueDetail(value) {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.mergeRequests) &&
    value.mergeRequests.every(isMergeRequestLink) &&
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
