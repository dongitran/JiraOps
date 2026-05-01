import { describe, expect, test } from 'vitest';

import { extractTextFromAdf, renderAdfHtml } from './jiraAdfRenderer';

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
});
