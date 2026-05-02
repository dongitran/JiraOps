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
      mainHtml: '<p>Main ticket content.</p>',
      technicalNotesHtml: '<p>Keep retry budget in place.</p>',
    });
  });
});
