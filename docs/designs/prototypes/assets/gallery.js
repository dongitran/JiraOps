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
const BASE_BRANCH_OPTIONS = ['staging', 'main', 'develop', 'master', 'release'];

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
        <span>JiraOps 0.1.44 Release</span>
        <h1>What Is New</h1>
        <p>Issue Details now refresh available status choices after a status change.</p>
      </header>
      <section class="whats-new-hero" aria-label="Release summary">
        <div>
          <strong>Release 0.1.44</strong>
          <p>Status workflows stay current inside the already-open Details tab.</p>
        </div>
        <span>🚀</span>
      </section>
      <section class="whats-new-grid" aria-label="Release highlights">
        <article>
          <span aria-hidden="true">📌</span>
          <strong>Status</strong>
          <p>Changing status refreshes the next available Jira transitions in place.</p>
        </article>
        <article>
          <span aria-hidden="true">🧾</span>
          <strong>Details</strong>
          <p>The open detail tab no longer needs to be closed and reopened for new choices.</p>
        </article>
        <article>
          <span aria-hidden="true">🔁</span>
          <strong>Dashboard</strong>
          <p>Assigned ticket refresh still runs after a detail action completes.</p>
        </article>
        <article>
          <span aria-hidden="true">✅</span>
          <strong>Testing</strong>
          <p>Coverage checks refreshed transition options and deterministic status flows.</p>
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
        <h1 title="${escapeAttribute(issue.summary)}">${escapeHtml(issue.summary)}</h1>
        <div class="editor-detail-meta-row">
          <span class="detail-key">${escapeHtml(issue.key)}</span>
          ${renderDetailHeaderActions(issue)}
        </div>
      </header>
      <section class="detail-section detail-content-section" aria-label="Description and comments">
        ${renderIssueContent(issue)}
      </section>
      ${renderCountedDetailSection('GitLab merge requests', issue.mergeRequests, renderMergeRequests)}
      ${renderCountedDetailSection('Clone merge requests', issue.cloneMergeRequests, renderCloneMergeRequests)}
      ${renderCountedDetailSection('All Jira web links', issue.webLinks, renderWebLinks)}
      ${renderActivitySection(issue)}
      ${renderTechnicalNotesSection(issue)}
      <section class="detail-section" aria-label="Attachments" data-detail-section="attachments">
        <div class="detail-section-heading">
          <h2>Attachments</h2>
          <span>${String(issue.attachments.length)}</span>
        </div>
        ${renderAttachments(issue.attachments)}
      </section>
      ${renderCloneDialog(issue)}
      ${renderWorklogDialog(issue)}
      ${renderImageLightboxDialog()}
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

function renderImageLightboxDialog() {
  return `
    <dialog class="detail-image-lightbox-dialog" aria-label="Image viewer">
      <button class="detail-image-lightbox-close" type="button" aria-label="Close image viewer">&times;</button>
      <figure class="detail-image-lightbox-figure">
        <img class="detail-image-lightbox-img" src="" alt="" />
      </figure>
    </dialog>
  `;
}

function renderCloneDialog(issue) {
  return `
    <dialog class="detail-clone-dialog" aria-label="Clone merge request">
      <form class="detail-clone-form" data-detail-action="clone" data-issue-key="${escapeAttribute(issue.key)}">
        <div class="detail-dialog-heading">
          <div>
            <span>${escapeHtml(issue.key)}</span>
            <h2>Clone merge request</h2>
          </div>
          <button type="button" class="detail-dialog-close" data-clone-action="close" aria-label="Close Clone merge request">&times;</button>
        </div>
        <p class="detail-clone-source" data-clone-source>Choose a merge request to clone.</p>
        <label>
          <span>Destination group</span>
          <input name="destinationGroup" type="text" autocomplete="off" placeholder="group-b" />
        </label>
        <label>
          <span>Base branch</span>
          <input name="baseBranch" type="text" list="clone-base-branches-${escapeAttribute(issue.key)}" autocomplete="off" value="staging" />
        </label>
        <datalist id="clone-base-branches-${escapeAttribute(issue.key)}">
          ${BASE_BRANCH_OPTIONS.map((branch) => `<option value="${escapeAttribute(branch)}"></option>`).join('')}
        </datalist>
        <label>
          <span>Port branch</span>
          <input name="portBranch" type="text" autocomplete="off" value="cherry-pick/${escapeAttribute(issue.key)}" />
        </label>
        <label>
          <span>Title</span>
          <input name="title" type="text" autocomplete="off" />
        </label>
        <p class="detail-dialog-status" role="status" aria-live="polite"></p>
        <div class="detail-dialog-actions">
          <button type="button" class="detail-dialog-secondary" data-clone-action="close">Cancel</button>
          <button type="submit" class="detail-dialog-primary">Clone MR</button>
        </div>
      </form>
    </dialog>
  `;
}

function renderActivitySection(issue) {
  if (typeof issue.activityHtml !== 'string' || issue.activityHtml.length === 0) {
    return '';
  }

  return `
    <section class="detail-section" aria-label="Activity" data-detail-section="activity">
      <div class="detail-section-heading">
        <h2>Activity</h2>
      </div>
      <div class="detail-content jira-adf-content">
        ${issue.activityHtml}
      </div>
    </section>
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
  return `
    <div class="detail-grid">
      ${mergeRequests
        .map((mergeRequest) => {
          return `
            <a class="detail-link detail-link-primary" href="${escapeAttribute(mergeRequest.url)}">
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
  return `
    <div class="detail-grid">
      ${mergeRequests.map(renderCloneMergeRequestCard).join('')}
    </div>
  `;
}

function renderCloneMergeRequestCard(mergeRequest) {
  return `
    <article class="detail-link detail-link-primary detail-clone-mr-card" aria-label="${escapeAttribute(`${mergeRequest.title} clone merge request`)}" data-source-mr-url="${escapeAttribute(mergeRequest.url)}">
      <a class="detail-clone-mr-link" href="${escapeAttribute(mergeRequest.url)}">
        <strong>${escapeHtml(mergeRequest.title)}</strong>
        <span>Clone ticket ${escapeHtml(mergeRequest.issueKey)} - ${escapeHtml(mergeRequest.projectPath)} !${escapeHtml(mergeRequest.iid)}</span>
      </a>
      <button class="detail-clone-button" type="button" data-clone-action="open" data-source-mr-url="${escapeAttribute(mergeRequest.url)}" aria-label="Clone ${escapeAttribute(mergeRequest.title)}">Clone</button>
      <p class="detail-clone-status" role="status" aria-live="polite"></p>
    </article>
  `;
}

function renderWebLinks(webLinks) {
  return `
    <div class="detail-grid">
      ${webLinks
        .map((webLink) => {
          return `
            <a class="detail-link" href="${escapeAttribute(webLink.url)}">
              <strong>${escapeHtml(webLink.title)}</strong>
              <span>${escapeHtml(webLink.relationship)} - ${escapeHtml(webLink.host)}</span>
            </a>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderCountedDetailSection(title, items, renderItems) {
  if (items.length === 0) {
    return '';
  }

  return `
    <section class="detail-section" aria-label="${escapeAttribute(title)}">
      <div class="detail-section-heading">
        <h2>${escapeHtml(title)}</h2>
        <span>${String(items.length)}</span>
      </div>
      ${renderItems(items)}
    </section>
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
          return `
            <article class="attachment-card">
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

  bindCloneMergeRequestActions(issue);
  bindImageLightbox();
}

function bindImageLightbox() {
  if (editorSurface.dataset.imageLightboxBound === 'true') {
    return;
  }

  editorSurface.dataset.imageLightboxBound = 'true';
  editorSurface.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLImageElement && target.dataset.lightbox === 'true') {
      openPrototypeImageLightbox(target);
      return;
    }

    if (target instanceof HTMLButtonElement && target.classList.contains('detail-image-lightbox-close')) {
      closePrototypeImageLightbox();
      return;
    }

    if (target instanceof HTMLDialogElement && target.classList.contains('detail-image-lightbox-dialog')) {
      target.close();
    }
  });
}

function openPrototypeImageLightbox(sourceImage) {
  const dialog = editorSurface.querySelector('.detail-image-lightbox-dialog');
  const lightboxImage = dialog?.querySelector('.detail-image-lightbox-img');
  if (!(dialog instanceof HTMLDialogElement) || !(lightboxImage instanceof HTMLImageElement)) {
    return;
  }

  lightboxImage.src = sourceImage.currentSrc || sourceImage.src;
  lightboxImage.alt = sourceImage.alt;
  dialog.addEventListener('close', () => clearPrototypeImageLightbox(dialog), { once: true });
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
    return;
  }
  dialog.setAttribute('open', '');
}

function closePrototypeImageLightbox() {
  const dialog = editorSurface.querySelector('.detail-image-lightbox-dialog');
  if (dialog instanceof HTMLDialogElement) {
    dialog.close();
    clearPrototypeImageLightbox(dialog);
  }
}

function clearPrototypeImageLightbox(dialog) {
  const lightboxImage = dialog.querySelector('.detail-image-lightbox-img');
  if (lightboxImage instanceof HTMLImageElement) {
    lightboxImage.removeAttribute('src');
    lightboxImage.alt = '';
  }
}

function bindCloneMergeRequestActions(issue) {
  for (const cloneButton of editorSurface.querySelectorAll('[data-clone-action="open"]')) {
    cloneButton.addEventListener('click', () => {
      if (cloneButton instanceof HTMLButtonElement) {
        openPrototypeCloneDialog(cloneButton, issue);
      }
    });
  }

  for (const closeButton of editorSurface.querySelectorAll('[data-clone-action="close"]')) {
    closeButton.addEventListener('click', closePrototypeCloneDialog);
  }

  const cloneForm = editorSurface.querySelector('form[data-detail-action="clone"]');
  if (cloneForm instanceof HTMLFormElement) {
    cloneForm.addEventListener('submit', (event) => {
      event.preventDefault();
      applyPrototypeCloneMergeRequest(cloneForm, issue);
    });
  }
}

function openPrototypeCloneDialog(button, issue) {
  const mergeRequest = issue.cloneMergeRequests.find((item) => item.url === button.dataset.sourceMrUrl);
  const dialog = editorSurface.querySelector('.detail-clone-dialog');
  const form = editorSurface.querySelector('form[data-detail-action="clone"]');
  if (!(dialog instanceof HTMLDialogElement) || !(form instanceof HTMLFormElement) || mergeRequest === undefined) {
    return;
  }

  form.dataset.sourceMrUrl = mergeRequest.url;
  setCloneDialogStatus('');
  setInputValue(form, 'destinationGroup', '');
  setInputValue(form, 'baseBranch', 'staging');
  setInputValue(form, 'portBranch', `cherry-pick/${issue.key}`);
  setInputValue(form, 'title', buildPrototypeCloneTitle(mergeRequest.title, issue.key));
  const source = form.querySelector('[data-clone-source]');
  if (source instanceof HTMLElement) {
    source.textContent = `${mergeRequest.title} - ${mergeRequest.projectPath} !${mergeRequest.iid}`;
  }

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
    return;
  }
  dialog.setAttribute('open', '');
}

function closePrototypeCloneDialog() {
  const dialog = editorSurface.querySelector('.detail-clone-dialog');
  if (dialog instanceof HTMLDialogElement) {
    dialog.close();
  }
}

function applyPrototypeCloneMergeRequest(form, issue) {
  const sourceMrUrl = form.dataset.sourceMrUrl ?? '';
  const mergeRequest = issue.cloneMergeRequests.find((item) => item.url === sourceMrUrl);
  const destinationGroup = getInputValue(form, 'destinationGroup').trim();
  const baseBranch = getInputValue(form, 'baseBranch').trim();
  const portBranch = getInputValue(form, 'portBranch').trim();
  const title = getInputValue(form, 'title').trim();
  if (mergeRequest === undefined || destinationGroup.length === 0 || baseBranch.length === 0 || portBranch.length === 0 || title.length === 0) {
    setCloneDialogStatus('Complete every clone field.');
    return;
  }

  let clonedUrl = '';
  try {
    clonedUrl = buildPrototypeDestinationMergeRequestUrl(mergeRequest.url, destinationGroup);
  } catch {
    setCloneDialogStatus('Enter a valid destination group.');
    return;
  }

  closePrototypeCloneDialog();
  setCloneCardLoading(sourceMrUrl, true);
  window.setTimeout(() => {
    setCloneCardSuccess(sourceMrUrl, clonedUrl, title);
  }, 650);
}

function applyPrototypeStatusTransition(select, issue) {
  if (select.selectedOptions.length === 0 || select.value.length === 0) {
    setDetailActionStatus('Choose an available status transition.');
    return;
  }

  const transitionId = select.value;
  const nextStatus = select.selectedOptions[0]?.dataset.status ?? '';
  select.disabled = true;
  setDetailActionStatus('Updating status…');
  issue.status = nextStatus.length > 0 ? nextStatus : issue.status;
  issue.transitions = resolvePrototypeTransitionsAfterStatusChange(issue, transitionId);
  replacePrototypeStatusOptions(select, issue.status, issue.transitions);
  select.disabled = issue.transitions.length === 0;
  setDetailActionStatus(`Status changed to ${issue.status}.`);
}

function replacePrototypeStatusOptions(select, currentStatus, transitions) {
  const currentOption = new Option(currentStatus, '', true, true);
  currentOption.dataset.status = currentStatus;
  select.replaceChildren(currentOption);
  for (const transition of transitions) {
    const option = new Option(transition.toStatus, transition.id);
    option.dataset.status = transition.toStatus;
    select.append(option);
  }
  select.value = '';
}

function resolvePrototypeTransitionsAfterStatusChange(issue, transitionId) {
  return issue.transitions.filter((transition) => {
    return transition.id !== transitionId && transition.toStatus !== issue.status;
  });
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
  const status = editorSurface.querySelector('.detail-worklog-dialog .detail-dialog-status');
  if (status instanceof HTMLElement) {
    status.textContent = message;
  }
}

function setCloneDialogStatus(message) {
  const status = editorSurface.querySelector('.detail-clone-dialog .detail-dialog-status');
  if (status instanceof HTMLElement) {
    status.textContent = message;
  }
}

function setCloneCardLoading(sourceMrUrl, loading) {
  const card = findCloneCard(sourceMrUrl);
  const button = card?.querySelector('[data-clone-action="open"]');
  const status = card?.querySelector('.detail-clone-status');
  if (button instanceof HTMLButtonElement) {
    button.disabled = loading;
    button.textContent = loading ? 'Cloning...' : 'Clone';
  }
  if (status instanceof HTMLElement) {
    status.textContent = loading ? 'Cloning merge request...' : '';
  }
}

function setCloneCardSuccess(sourceMrUrl, clonedUrl, title) {
  const card = findCloneCard(sourceMrUrl);
  const button = card?.querySelector('[data-clone-action="open"]');
  const status = card?.querySelector('.detail-clone-status');
  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
    button.textContent = 'Cloned';
  }
  if (status instanceof HTMLElement) {
    status.innerHTML = `Cloned as <a href="${escapeAttribute(clonedUrl)}" aria-label="Open cloned merge request">${escapeHtml(title)}</a>`;
  }
  if (card instanceof HTMLElement) {
    card.dataset.cloneState = 'cloned';
  }
}

function findCloneCard(sourceMrUrl) {
  return editorSurface.querySelector(`.detail-clone-mr-card[data-source-mr-url="${cssEscape(sourceMrUrl)}"]`);
}

function getInputValue(form, name) {
  const input = form.elements.namedItem(name);
  return input instanceof HTMLInputElement ? input.value : '';
}

function setInputValue(form, name, value) {
  const input = form.elements.namedItem(name);
  if (input instanceof HTMLInputElement) {
    input.value = value;
  }
}

function buildPrototypeCloneTitle(sourceTitle, issueKey) {
  const sourceKey = extractIssueKeyFromTitle(sourceTitle);
  return `[Clone] ${sourceKey.length > 0 ? sourceKey : sourceTitle} ${issueKey}`;
}

function extractIssueKeyFromTitle(title) {
  const afterDash = /merge request\s*-\s*([A-Z][A-Z0-9]+-\d+)/iu.exec(title)?.[1];
  if (afterDash !== undefined) {
    return afterDash.toUpperCase();
  }

  return /\b([A-Z][A-Z0-9]+-\d+)\b/u.exec(title)?.[1] ?? '';
}

function buildPrototypeDestinationMergeRequestUrl(sourceMrUrl, destinationGroup) {
  const source = new URL(sourceMrUrl);
  const marker = '/-/merge_requests/';
  const markerIndex = source.pathname.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('Invalid merge request URL.');
  }
  const repoParts = source.pathname.slice(1, markerIndex).split('/').filter(Boolean);
  const groupParts = destinationGroup.split('/').filter(Boolean);
  if (repoParts.length < 2 || groupParts.length === 0 || groupParts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid destination group.');
  }
  source.pathname = `/${[...groupParts, ...repoParts.slice(1)].join('/')}/-/merge_requests/777`;
  source.search = '';
  source.hash = '';
  return source.toString();
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return String(value).replaceAll('"', '\\"');
}

function isIssueDetail(value) {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.status === 'string' &&
    typeof value.description === 'string' &&
    typeof value.activityHtml === 'string' &&
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
