import { describe, expect, test } from 'vitest';

import { extractTextFromAdf, renderAdfHtml, renderAdfHtmlSections } from './jiraAdfRenderer';

describe('jiraAdfRenderer', () => {
  test('renders common Jira document formatting as safe HTML', () => {
    const document = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Release checklist' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Review ' },
            { type: 'text', text: 'alerts', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' before ' },
            {
              type: 'text',
              text: 'approval',
              marks: [{ type: 'link', attrs: { href: 'https://docs.example.com/runbook' } }],
            },
            { type: 'text', text: '.' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Then merge.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Verify retry budget' }] }],
            },
          ],
        },
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'npm test' }],
        },
      ],
    };

    expect(renderAdfHtml(document)).toBe(
      '<h3>Release checklist</h3><p>Review <strong>alerts</strong> before <a href="https://docs.example.com/runbook">approval</a>.<br />Then merge.</p><ul><li><p>Verify retry budget</p></li></ul><pre><code>npm test</code></pre>'
    );
    expect(extractTextFromAdf(document)).toBe(
      'Release checklist\nReview alerts before approval.\nThen merge.\nVerify retry budget\nnpm test'
    );
  });

  test('escapes text and drops unsafe links from Jira content', () => {
    const html = renderAdfHtml({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '<script>alert("x")</script>',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    });

    expect(html).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script>');
  });

  test('renders Jira tables as semantic table HTML', () => {
    const html = renderAdfHtml({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Signal' }] }],
                },
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Delayed settlements' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '8 minutes' }] }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(html).toBe(
      '<table><tr><th><p>Signal</p></th><th><p>Target</p></th></tr><tr><td><p>Delayed settlements</p></td><td><p>8 minutes</p></td></tr></table>'
    );
  });

  test('renders Jira media nodes as safe inline description images', () => {
    const html = renderAdfHtml(
      {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before image.' }],
          },
          {
            type: 'mediaSingle',
            attrs: { layout: 'center' },
            content: [
              {
                type: 'media',
                attrs: {
                  alt: 'system-diagram.png',
                  height: 360,
                  id: 'jira-media-id',
                  type: 'file',
                  width: 640,
                },
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'After image.' }],
          },
        ],
      },
      {
        mediaImages: [
          {
            filename: 'system-diagram.png',
            id: '10001',
            imageDataUri: 'data:image/png;base64,AQID',
            mimeType: 'image/png',
          },
        ],
      }
    );

    expect(html).toBe(
      '<p>Before image.</p><figure class="jira-adf-media jira-adf-media-single" data-layout="center"><img src="data:image/png;base64,AQID" alt="system-diagram.png" width="640" height="360" loading="lazy" /></figure><p>After image.</p>'
    );
  });

  test('renders a neutral placeholder for Jira media without a safe image data URI', () => {
    const html = renderAdfHtml(
      {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  alt: 'unsafe-preview.png',
                  id: '10001',
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      {
        mediaImages: [
          {
            filename: 'unsafe-preview.png',
            id: '10001',
            imageDataUri: 'data:text/html;base64,PGgxPk5vdCBhbiBpbWFnZTwvaDE+',
            mimeType: 'text/html',
          },
        ],
      }
    );

    expect(html).toBe(
      '<figure class="jira-adf-media jira-adf-media-single" data-layout="center"><span class="jira-adf-media-placeholder" role="img" aria-label="unsafe-preview.png">Image preview unavailable</span></figure>'
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('data:text/html');
  });

  test('does not reuse one unmatched hydrated image across multiple Jira media nodes', () => {
    const html = renderAdfHtml(
      {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'mediaSingle',
            content: [{ type: 'media', attrs: { id: 'jira-media-1', type: 'file' } }],
          },
          {
            type: 'mediaSingle',
            content: [{ type: 'media', attrs: { id: 'jira-media-2', type: 'file' } }],
          },
        ],
      },
      {
        mediaImages: [
          {
            filename: 'only-safe-preview.png',
            id: '10001',
            imageDataUri: 'data:image/png;base64,AQID',
            mimeType: 'image/png',
          },
        ],
      }
    );

    expect(html).not.toContain('<img');
    expect(html.match(/Image preview unavailable/gu)).toHaveLength(2);
  });

  test('maps unresolved Jira media service IDs to hydrated images by one-to-one order', () => {
    const html = renderAdfHtml(
      {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: '4478e39c-cf9b-41d1-ba92-68589487cd75',
                  type: 'file',
                },
              },
            ],
          },
          {
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: '5be450d6-f635-45f2-905b-714d71765c6a',
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      {
        mediaImages: [
          {
            filename: 'first-preview.png',
            id: '10001',
            imageDataUri: 'data:image/png;base64,AQID',
            mimeType: 'image/png',
          },
          {
            filename: 'second-preview.png',
            id: '10002',
            imageDataUri: 'data:image/png;base64,Ag==',
            mimeType: 'image/png',
          },
        ],
      }
    );

    expect(html).toContain(
      '<img src="data:image/png;base64,AQID" alt="first-preview.png" loading="lazy" />'
    );
    expect(html).toContain(
      '<img src="data:image/png;base64,Ag==" alt="second-preview.png" loading="lazy" />'
    );
    expect(html).not.toContain('Image preview unavailable');
  });

  test('resolves ordered media assignments after extracting activity sections', () => {
    const sections = renderAdfHtmlSections(
      {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: '4478e39c-cf9b-41d1-ba92-68589487cd75',
                  type: 'file',
                },
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Activity' }],
          },
          {
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: '5be450d6-f635-45f2-905b-714d71765c6a',
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      {
        mediaImages: [
          {
            filename: 'description-preview.png',
            id: '10001',
            imageDataUri: 'data:image/png;base64,AQID',
            mimeType: 'image/png',
          },
          {
            filename: 'activity-preview.png',
            id: '10002',
            imageDataUri: 'data:image/png;base64,Ag==',
            mimeType: 'image/png',
          },
        ],
      }
    );

    expect(sections.mainHtml).toContain(
      '<img src="data:image/png;base64,AQID" alt="description-preview.png" loading="lazy" />'
    );
    expect(sections.activityHtml).toContain(
      '<img src="data:image/png;base64,Ag==" alt="activity-preview.png" loading="lazy" />'
    );
    expect(sections.technicalNotesHtml).toBe('');
  });

  test('resolves a hydrated ordered media image without blocking unavailable neighbors', () => {
    const html = renderAdfHtml(
      {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'mediaSingle',
            content: [{ type: 'media', attrs: { id: 'first-media-id', type: 'file' } }],
          },
          {
            type: 'mediaSingle',
            content: [{ type: 'media', attrs: { id: 'second-media-id', type: 'file' } }],
          },
        ],
      },
      {
        mediaImages: [
          {
            filename: 'second-preview.png',
            id: '10002',
            imageDataUri: 'data:image/png;base64,Ag==',
            mediaNodeIndex: 1,
            mimeType: 'image/png',
          },
        ],
      }
    );

    expect(html).toContain('Image preview unavailable');
    expect(html).toContain(
      '<img src="data:image/png;base64,Ag==" alt="second-preview.png" loading="lazy" />'
    );
  });

  test('splits top-level technical notes from the main Jira description', () => {
    const sections = renderAdfHtmlSections({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Overview' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Main implementation notes.' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Technical notes' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Keep the idempotency guard.' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Rollout' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Ship behind the alert toggle.' }],
        },
      ],
    });

    expect(sections).toEqual({
      activityHtml: '',
      mainHtml:
        '<h3>Overview</h3><p>Main implementation notes.</p><h3>Rollout</h3><p>Ship behind the alert toggle.</p>',
      technicalNotesHtml: '<p>Keep the idempotency guard.</p>',
    });
  });

  test('splits singular technical note headings with punctuation', () => {
    const sections = renderAdfHtmlSections({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Main ticket content.' }],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Technical note:' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Keep retry budget in place.' }],
        },
      ],
    });

    expect(sections).toEqual({
      activityHtml: '',
      mainHtml: '<p>Main ticket content.</p>',
      technicalNotesHtml: '<p>Keep retry budget in place.</p>',
    });
  });

  test('splits paragraph-style technical note markers after test strategy', () => {
    const sections = renderAdfHtmlSections({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Test Strategy' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Run checkout and reconciliation regression.' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Technical Note:',
              marks: [{ type: 'strong' }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Keep the rollback query pinned.' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Rollout' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Ship after QA sign-off.' }],
        },
      ],
    });

    expect(sections).toEqual({
      activityHtml: '',
      mainHtml:
        '<h3>Test Strategy</h3><p>Run checkout and reconciliation regression.</p><h3>Rollout</h3><p>Ship after QA sign-off.</p>',
      technicalNotesHtml: '<p>Keep the rollback query pinned.</p>',
    });
  });

  test('splits activity out of technical notes and main description', () => {
    const sections = renderAdfHtmlSections({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Overview' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Main ticket content.' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Technical Note:' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Keep retry budget in place.' }],
        },
        {
          type: 'heading',
          attrs: { level: 4 },
          content: [{ type: 'text', text: 'Activity' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Current User moved this issue to review.' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Rollout' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Ship after QA sign-off.' }],
        },
      ],
    });

    expect(sections).toEqual({
      activityHtml: '<p>Current User moved this issue to review.</p>',
      mainHtml:
        '<h3>Overview</h3><p>Main ticket content.</p><h3>Rollout</h3><p>Ship after QA sign-off.</p>',
      technicalNotesHtml: '<p>Keep retry budget in place.</p>',
    });
  });
});
