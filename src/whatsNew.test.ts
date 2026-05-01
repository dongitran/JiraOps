import { describe, expect, test } from 'vitest';

import {
  parseLatestChangelogSection,
  renderWhatsNewHtml,
  shouldShowWhatsNew,
} from './whatsNew';

const CHANGELOG = `# Changelog

## 0.1.11

- Add assigned issue update notifications.
- Keep Details warm from cache.

## 0.1.10

- Promote JiraOps to stable.
`;

describe('What Is New', () => {
  test('shows when the current extension version has not been seen', () => {
    expect(
      shouldShowWhatsNew({
        currentVersion: '0.1.11',
        force: false,
        seenVersion: '0.1.10',
        suppress: false,
      })
    ).toBe(true);
  });

  test('skips when the current extension version was already seen', () => {
    expect(
      shouldShowWhatsNew({
        currentVersion: '0.1.11',
        force: false,
        seenVersion: '0.1.11',
        suppress: false,
      })
    ).toBe(false);
  });

  test('lets deterministic test flags force or suppress the panel', () => {
    expect(
      shouldShowWhatsNew({
        currentVersion: '0.1.11',
        force: true,
        seenVersion: '0.1.11',
        suppress: false,
      })
    ).toBe(true);
    expect(
      shouldShowWhatsNew({
        currentVersion: '0.1.11',
        force: true,
        seenVersion: '0.1.10',
        suppress: true,
      })
    ).toBe(false);
  });

  test('parses only the newest changelog section', () => {
    expect(parseLatestChangelogSection(CHANGELOG)).toEqual({
      bullets: [
        'Add assigned issue update notifications.',
        'Keep Details warm from cache.',
      ],
      version: '0.1.11',
    });
  });

  test('escapes release note content in rendered HTML', () => {
    const html = renderWhatsNewHtml({
      bullets: ['Fix <script>alert("x")</script> in release notes.'],
      version: '0.1.11',
    });

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
  });
});
