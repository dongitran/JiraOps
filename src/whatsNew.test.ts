import { describe, expect, test } from 'vitest';

import {
  WHATS_NEW_RELEASE_VERSION,
  parseChangelogSection,
  renderWhatsNewHtml,
  shouldShowWhatsNew,
} from './whatsNew';

const CHANGELOG = `# Changelog

## 0.1.36

### Details

- Expand inline Jira description images across the available Details width.
- Keep image attachments listed without rendering duplicate previews.

### Testing

- Add e2e coverage for full-width description images and metadata-only image attachments.

## 0.1.35

### Details

- Hydrate inline Jira description images through Jira attachment proxy redirects.
- Keep signed Atlassian media URL fetches free of Authorization headers.
- Log sanitized proxy and media HTTP status codes.

### Testing

- Add unit coverage for redirect-compatible Jira attachment proxy requests.

## 0.1.33

### Details

- Match Jira ADF media nodes with Media Platform file IDs captured from attachment redirects.
- Fetch signed Atlassian media URLs without Authorization headers while keeping attachment image byte limits.
- Log sanitized media diagnostics for captured media ID hints and remaining placeholders.

### Testing

- Add unit coverage for inline description media that only matches through redirect-derived Jira media IDs.

## 0.1.32

### Details

- Fetch Jira attachment thumbnails through redirects.
- Fall back to bounded attachment content when thumbnail responses are not images.
- Keep attachment image byte limits and avoid logging signed image URLs.

## 0.1.31

### Details

- Resolve inline Jira description images through renderedFields attachment IDs.
- Hydrate rendered inline image attachments before unrelated image attachments.
- Log rendered inline image hint counts without attachment URLs.

## 0.1.30

### Details

- Resolve Jira description images when ADF media IDs differ from attachment IDs.
- Log unavailable inline image placeholder counts.

## 0.1.29

### Details

- Render Jira description images inline in their original position.
- Log sanitized Jira image hydration counts.

### Testing

- Add unit and e2e coverage for inline Jira description images.

## 0.1.28

### Dashboard

- Assigned tickets, compact and scannable.

### Details

- Jira links, activity, and clone results.

### MR Clone

- Clone stale GitLab MRs safely.

### Jira Actions

- Change status and log work safely.

## 0.1.27

- Stable build with cleaner notes.

## 0.1.26

- Stable build with cleaner notes.

## 0.1.23

- Stable build with cleaner notes.

## 0.1.22

- Promote JiraOps back to the stable release lane.

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
    expect(parseChangelogSection(CHANGELOG, '0.1.33')).toEqual({
      bullets: [
        'Match Jira ADF media nodes with Media Platform file IDs captured from attachment redirects.',
        'Fetch signed Atlassian media URLs without Authorization headers while keeping attachment image byte limits.',
        'Log sanitized media diagnostics for captured media ID hints and remaining placeholders.',
        'Add unit coverage for inline description media that only matches through redirect-derived Jira media IDs.',
      ],
      sections: [
        {
          title: 'Details',
          bullets: [
            'Match Jira ADF media nodes with Media Platform file IDs captured from attachment redirects.',
            'Fetch signed Atlassian media URLs without Authorization headers while keeping attachment image byte limits.',
            'Log sanitized media diagnostics for captured media ID hints and remaining placeholders.',
          ],
        },
        {
          title: 'Testing',
          bullets: [
            'Add unit coverage for inline description media that only matches through redirect-derived Jira media IDs.',
          ],
        },
      ],
      version: '0.1.33',
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
      version: '0.1.33',
    });

    expect(html).toContain('JiraOps 0.1.33 Release');
    expect(html).toContain('🚀');
    expect(html).toContain('📌');
    expect(html).toContain('Secure &lt;b&gt;notes&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
  });
});
