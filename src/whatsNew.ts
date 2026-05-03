export const WHATS_NEW_LAST_SEEN_VERSION_KEY =
  'jiraOps.whatsNew.lastSeenVersion.v1';
export const WHATS_NEW_RELEASE_VERSION = '0.1.25';

export interface WhatsNewSection {
  readonly title: string;
  readonly bullets: readonly string[];
}

export interface WhatsNewReleaseNotes {
  readonly bullets: readonly string[];
  readonly sections: readonly WhatsNewSection[];
  readonly version: string;
}

export interface ShouldShowWhatsNewOptions {
  readonly currentVersion: string;
  readonly force: boolean;
  readonly seenVersion: string | undefined;
  readonly suppress: boolean;
}

const WHATS_NEW_STYLE = `
    :root { color-scheme: dark; }
    body {
      margin: 0;
      padding: 24px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    main { display: grid; gap: 16px; max-width: 940px; }
    header { display: grid; gap: 8px; }
    header span {
      color: var(--vscode-textLink-foreground);
      font-size: 12px;
      font-weight: 700;
    }
    h1 { margin: 0; font-size: 38px; line-height: 1.1; }
    p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.5; }
    .release-summary {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 7px;
      background: var(--vscode-sideBar-background);
    }
    .release-summary div { display: grid; gap: 6px; }
    .release-summary strong { font-size: 18px; }
    .release-summary > span {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-editorWidget-background);
      font-size: 24px;
    }
    .release-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 10px;
    }
    article {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr);
      gap: 8px;
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-editorWidget-background);
    }
    article > span {
      grid-column: 1;
      grid-row: 1;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      font-size: 18px;
    }
    h2 { grid-column: 2; grid-row: 1; align-self: center; min-width: 0; margin: 0; font-size: 14px; line-height: 1.35; }
    ul { display: grid; gap: 6px; margin: 0; padding-left: 18px; }
    article ul { grid-column: 1 / -1; grid-row: 2; }
    li { line-height: 1.4; }
    @media (max-width: 620px) {
      body { padding: 18px; }
      .release-summary { align-items: flex-start; flex-direction: column; }
      .release-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    }
  `;

const RELEASE_ICONS = ['📌', '🧾', '🔔', '✅'] as const;

export function shouldShowWhatsNew(options: ShouldShowWhatsNewOptions): boolean {
  if (options.suppress) {
    return false;
  }

  if (options.force) {
    return true;
  }

  return options.currentVersion.trim().length > 0 && options.currentVersion !== options.seenVersion;
}

export function parseLatestChangelogSection(
  changelog: string
): WhatsNewReleaseNotes {
  return parseChangelogSectionByIndex(changelog, findLatestHeadingIndex(changelog));
}

export function parseChangelogSection(
  changelog: string,
  version: string
): WhatsNewReleaseNotes {
  const lines = changelog.split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${version}`);
  return parseChangelogSectionLines(lines, headingIndex);
}

function parseChangelogSectionByIndex(
  changelog: string,
  headingIndex: number
): WhatsNewReleaseNotes {
  return parseChangelogSectionLines(changelog.split(/\r?\n/u), headingIndex);
}

function parseChangelogSectionLines(
  lines: readonly string[],
  headingIndex: number
): WhatsNewReleaseNotes {
  if (headingIndex < 0) {
    return {
      bullets: [],
      sections: [],
      version: 'Unreleased',
    };
  }

  const version = lines[headingIndex]?.replace(/^##\s+/u, '').trim() ?? 'Unreleased';
  const bodyLines = readSectionBodyLines(lines, headingIndex + 1);
  const sections = parseGroupedBullets(bodyLines);
  return {
    bullets: sections.flatMap((section) => section.bullets),
    sections,
    version,
  };
}

export function renderWhatsNewHtml(notes: WhatsNewReleaseNotes): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>JiraOps ${escapeHtml(notes.version)} What Is New</title>
    <style>${renderWhatsNewStyle()}</style>
  </head>
  <body>
    <main aria-label="JiraOps release notes">
      <header>
        <span>JiraOps ${escapeHtml(notes.version)} Stable</span>
        <h1>What Is New</h1>
        <p>Cleaner triage, focused Details, visible updates, and safe actions.</p>
      </header>
      <section class="release-summary" aria-label="Stable release summary">
        <div>
          <strong>Stable ${escapeHtml(notes.version)}</strong>
          <p>Four core JiraOps workflows in one clean view.</p>
        </div>
        <span aria-hidden="true">🚀</span>
      </section>
      <section class="release-grid" aria-label="Release highlights">
        ${renderWhatsNewSections(notes)}
      </section>
    </main>
  </body>
</html>`;
}

function renderWhatsNewSections(notes: WhatsNewReleaseNotes): string {
  const sections =
    notes.sections.length > 0
      ? notes.sections
      : [{ title: 'Release Highlights', bullets: notes.bullets }];
  if (sections.length === 0 || sections.every((section) => section.bullets.length === 0)) {
    return renderFeatureSection(
      { title: 'Release Highlights', bullets: ['Review the changelog for the latest JiraOps changes.'] },
      0
    );
  }

  return sections
    .map((section, index) => {
      return renderFeatureSection(section, index);
    })
    .join('');
}

function renderFeatureSection(section: WhatsNewSection, index: number): string {
  const icon = RELEASE_ICONS[index % RELEASE_ICONS.length] ?? '✨';
  return `
        <article>
          <span aria-hidden="true">${escapeHtml(icon)}</span>
          <h2>${escapeHtml(section.title)}</h2>
          <ul>${renderSectionBullets(section.bullets)}</ul>
        </article>`;
}

function renderSectionBullets(bullets: readonly string[]): string {
  return bullets
    .map((bullet) => {
      return `<li>${escapeHtml(bullet)}</li>`;
    })
    .join('');
}

function renderWhatsNewStyle(): string {
  return WHATS_NEW_STYLE;
}

export function readWhatsNewSeenVersion(
  memento: { get(key: string): unknown }
): string | undefined {
  const value = memento.get(WHATS_NEW_LAST_SEEN_VERSION_KEY);
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export async function markWhatsNewSeen(
  memento: { update(key: string, value: unknown): Thenable<void> },
  version: string
): Promise<void> {
  await memento.update(WHATS_NEW_LAST_SEEN_VERSION_KEY, version);
}

function readSectionBodyLines(
  lines: readonly string[],
  startIndex: number
): readonly string[] {
  const bodyLines: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('## ')) {
      break;
    }

    bodyLines.push(line);
  }
  return bodyLines;
}

function parseGroupedBullets(lines: readonly string[]): WhatsNewSection[] {
  const sections: WhatsNewSection[] = [];
  let current: { title: string; bullets: string[] } = {
    title: 'Release Highlights',
    bullets: [],
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      current = pushSection(sections, current, trimmed.slice(4).trim());
      continue;
    }

    if (trimmed.startsWith('- ')) {
      current.bullets.push(trimmed.slice(2).trim());
    }
  }
  pushNonEmptySection(sections, current);
  return sections;
}

function pushSection(
  sections: WhatsNewSection[],
  current: { title: string; bullets: string[] },
  nextTitle: string
): { title: string; bullets: string[] } {
  pushNonEmptySection(sections, current);
  return {
    title: nextTitle.length > 0 ? nextTitle : 'Release Highlights',
    bullets: [],
  };
}

function pushNonEmptySection(
  sections: WhatsNewSection[],
  section: { title: string; bullets: string[] }
): void {
  if (section.bullets.length === 0) {
    return;
  }

  sections.push({
    title: section.title,
    bullets: section.bullets,
  });
}

function findLatestHeadingIndex(changelog: string): number {
  return changelog.split(/\r?\n/u).findIndex((line) => line.startsWith('## '));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
