import { describe, expect, test } from 'vitest';

import {
  WHATS_NEW_RELEASE_VERSION,
  parseChangelogSection,
  renderWhatsNewHtml,
  shouldShowWhatsNew,
} from './whatsNew';

const CHANGELOG = `# Changelog

## 0.1.22

### Details

- Keep the Details title above the Jira key/status action row.
- Keep status transitions and Log Work compact in the header.

### Stable release lane

- Publish CI-built VSIX packages and GitHub releases as stable.
- Show stable 0.1.22 What Is New content once per installed JiraOps version.

## 0.1.11

- Add assigned issue update notifications.
- Keep Details warm from cache.

## 0.1.10

### Dashboard

- Load active assigned Jira tickets.
- Keep connection state in the native view header.

### Details

- Show Jira descriptions, comments, attachments, and remote web links.
`;

describe('What Is New', () => {
  test('shows when the current extension version has not been seen', () => {
    expect(
      shouldShowWhatsNew({
        currentVersion: WHATS_NEW_RELEASE_VERSION,
        force: false,
        seenVersion: undefined,
        suppress: false,
      })
    ).toBe(true);
  });

  test('skips when the current extension version was already seen', () => {
    expect(
      shouldShowWhatsNew({
        currentVersion: WHATS_NEW_RELEASE_VERSION,
        force: false,
        seenVersion: WHATS_NEW_RELEASE_VERSION,
        suppress: false,
      })
    ).toBe(false);
  });

  test('lets deterministic test flags force or suppress the panel', () => {
    expect(
      shouldShowWhatsNew({
        currentVersion: WHATS_NEW_RELEASE_VERSION,
        force: true,
        seenVersion: WHATS_NEW_RELEASE_VERSION,
        suppress: false,
      })
    ).toBe(true);
    expect(
      shouldShowWhatsNew({
        currentVersion: WHATS_NEW_RELEASE_VERSION,
        force: true,
        seenVersion: undefined,
        suppress: true,
      })
    ).toBe(false);
  });

  test('parses the stable What Is New changelog section', () => {
    expect(parseChangelogSection(CHANGELOG, '0.1.22')).toEqual({
      bullets: [
        'Keep the Details title above the Jira key/status action row.',
        'Keep status transitions and Log Work compact in the header.',
        'Publish CI-built VSIX packages and GitHub releases as stable.',
        'Show stable 0.1.22 What Is New content once per installed JiraOps version.',
      ],
      sections: [
        {
          title: 'Details',
          bullets: [
            'Keep the Details title above the Jira key/status action row.',
            'Keep status transitions and Log Work compact in the header.',
          ],
        },
        {
          title: 'Stable release lane',
          bullets: [
            'Publish CI-built VSIX packages and GitHub releases as stable.',
            'Show stable 0.1.22 What Is New content once per installed JiraOps version.',
          ],
        },
      ],
      version: '0.1.22',
    });
  });

  test('renders escaped grouped release cards', () => {
    const html = renderWhatsNewHtml({
      bullets: ['Fix <script>alert("x")</script> in release notes.'],
      sections: [
        {
          title: 'Secure <b>notes</b>',
          bullets: ['Fix <script>alert("x")</script> in release notes.'],
        },
      ],
      version: '0.1.22',
    });

    expect(html).toContain('JiraOps 0.1.22 Stable');
    expect(html).toContain('Secure &lt;b&gt;notes&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
  });
});
