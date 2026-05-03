import type { DashboardIssue } from './dashboardItems';
import {
  CLONE_BASE_BRANCH_OPTIONS,
  buildCloneMergeRequestDefaults,
} from './gitportClone';

export function renderCloneMergeRequestSection(issue: DashboardIssue): string {
  const count = issue.cloneMergeRequests.length;
  const content =
    count === 0
      ? '<p class="detail-muted">No GitLab merge requests were found on cloned Jira work items.</p>'
      : `<div class="detail-grid">${issue.cloneMergeRequests.map((link) => renderCloneMergeRequestCard(issue, link)).join('')}</div>`;

  return renderDetailSection('Clone merge requests', count, content);
}

export function renderCloneDialog(issue: DashboardIssue): string {
  const datalistId = `clone-base-branches-${issue.key}`;
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
          <input name="baseBranch" type="text" list="${escapeAttribute(datalistId)}" autocomplete="off" />
        </label>
        <datalist id="${escapeAttribute(datalistId)}">
          ${CLONE_BASE_BRANCH_OPTIONS.map((branch) => `<option value="${escapeAttribute(branch)}"></option>`).join('')}
        </datalist>
        <label>
          <span>Port branch</span>
          <input name="portBranch" type="text" autocomplete="off" />
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

function renderCloneMergeRequestCard(
  issue: DashboardIssue,
  link: DashboardIssue['cloneMergeRequests'][number]
): string {
  const defaults = buildCloneMergeRequestDefaults(link.title, issue.key);
  const label = `Clone ticket ${link.issueKey} - ${link.projectPath} !${link.iid}`;
  return `
    <article class="detail-link detail-link-primary detail-clone-mr-card" aria-label="${escapeAttribute(`${link.title} clone merge request`)}" data-source-mr-url="${escapeAttribute(link.url)}">
      <a class="detail-clone-mr-link" href="${escapeAttribute(link.url)}">
        <strong>${escapeHtml(link.title)}</strong>
        <span>${escapeHtml(label)}</span>
      </a>
      <button
        class="detail-clone-button"
        type="button"
        data-clone-action="open"
        data-source-mr-url="${escapeAttribute(link.url)}"
        data-source-mr-title="${escapeAttribute(link.title)}"
        data-source-mr-label="${escapeAttribute(`${link.title} - ${link.projectPath} !${link.iid}`)}"
        data-default-base-branch="${escapeAttribute(defaults.baseBranch)}"
        data-default-port-branch="${escapeAttribute(defaults.portBranch)}"
        data-default-title="${escapeAttribute(defaults.title)}"
        aria-label="Clone ${escapeAttribute(link.title)}"
      >Clone</button>
      <p class="detail-clone-status" role="status" aria-live="polite"></p>
    </article>
  `;
}

function renderDetailSection(title: string, count: number, content: string): string {
  return `
    <section class="detail-section" aria-label="${escapeAttribute(title)}">
      <div class="detail-section-heading">
        <h2>${escapeHtml(title)}</h2>
        <span>${String(count)}</span>
      </div>
      ${content}
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
