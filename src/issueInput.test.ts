import { describe, expect, test } from 'vitest';

import { parseIssueInput } from './issueInput';

describe('parseIssueInput', () => {
  test('accepts a direct Jira issue key', () => {
    expect(parseIssueInput('OPS-123')).toEqual({
      ok: true,
      issueKey: 'OPS-123',
      sourceUrl: null,
    });
  });

  test('accepts a Jira browse URL', () => {
    expect(
      parseIssueInput('https://example.atlassian.net/browse/OPS-123?focusedCommentId=12')
    ).toEqual({
      ok: true,
      issueKey: 'OPS-123',
      sourceUrl: 'https://example.atlassian.net/browse/OPS-123?focusedCommentId=12',
    });
  });

  test('normalizes lowercase issue keys', () => {
    expect(parseIssueInput('ops-123')).toEqual({
      ok: true,
      issueKey: 'OPS-123',
      sourceUrl: null,
    });
  });

  test('rejects empty input with a neutral message', () => {
    expect(parseIssueInput('  ')).toEqual({
      ok: false,
      error: 'Enter a Jira issue key or browse URL.',
    });
  });

  test('rejects unsupported input with a neutral message', () => {
    expect(parseIssueInput('https://example.com/issue/123')).toEqual({
      ok: false,
      error: 'Enter a Jira issue key or browse URL.',
    });
  });
});
