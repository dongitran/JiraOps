export const WHATS_NEW_LAST_SEEN_VERSION_KEY =
  'jiraOps.whatsNew.lastSeenVersion.v1';

export interface WhatsNewReleaseNotes {
  readonly bullets: readonly string[];
  readonly version: string;
}

export interface ShouldShowWhatsNewOptions {
  readonly currentVersion: string;
  readonly force: boolean;
  readonly seenVersion: string | undefined;
  readonly suppress: boolean;
}

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
  const lines = changelog.split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => line.startsWith('## '));
  if (headingIndex < 0) {
    return {
      bullets: [],
      version: 'Unreleased',
    };
  }

  const version = lines[headingIndex]?.replace(/^##\s+/u, '').trim() ?? 'Unreleased';
  const bodyLines = readSectionBodyLines(lines, headingIndex + 1);
  return {
    bullets: bodyLines
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter((line) => line.length > 0),
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
        <span>JiraOps ${escapeHtml(notes.version)}</span>
        <h1>What Is New</h1>
        <p>Review the latest JiraOps changes before using this version.</p>
      </header>
      <section aria-label="Release highlights">
        <ul>${renderWhatsNewBullets(notes.bullets)}</ul>
      </section>
    </main>
  </body>
</html>`;
}

function renderWhatsNewBullets(bullets: readonly string[]): string {
  if (bullets.length === 0) {
    return '<li>Review the changelog for the latest JiraOps changes.</li>';
  }

  return bullets
    .map((bullet) => {
      return `<li>${escapeHtml(bullet)}</li>`;
    })
    .join('');
}

function renderWhatsNewStyle(): string {
  return `
      :root { color-scheme: dark; }
      body {
        margin: 0;
        padding: 28px;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-font-family);
      }
      main { display: grid; gap: 20px; max-width: 820px; }
      header { display: grid; gap: 8px; }
      span {
        color: var(--vscode-textLink-foreground);
        font-size: 12px;
        font-weight: 700;
      }
      h1 { margin: 0; font-size: 34px; line-height: 1.1; }
      p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.5; }
      ul { display: grid; gap: 8px; margin: 0; padding-left: 20px; }
      li { line-height: 1.5; }
    `;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
