export interface ParsedIssueInput {
  readonly ok: true;
  readonly issueKey: string;
  readonly sourceUrl: string | null;
}

export interface InvalidIssueInput {
  readonly ok: false;
  readonly error: string;
}

export type IssueInputResult = ParsedIssueInput | InvalidIssueInput;

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/i;
const BROWSE_PATH_PATTERN = /\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[/?#]|$)/i;
const INVALID_INPUT_MESSAGE = 'Enter a Jira issue key or browse URL.';

export function parseIssueInput(rawInput: string): IssueInputResult {
  const input = rawInput.trim();
  if (input.length === 0) {
    return invalidIssueInput();
  }

  const directKey = parseDirectIssueKey(input);
  if (directKey !== null) {
    return {
      ok: true,
      issueKey: directKey,
      sourceUrl: null,
    };
  }

  const urlIssueKey = parseIssueKeyFromUrl(input);
  if (urlIssueKey !== null) {
    return {
      ok: true,
      issueKey: urlIssueKey,
      sourceUrl: input,
    };
  }

  return invalidIssueInput();
}

function parseDirectIssueKey(input: string): string | null {
  if (!ISSUE_KEY_PATTERN.test(input)) {
    return null;
  }

  return input.toUpperCase();
}

function parseIssueKeyFromUrl(input: string): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return null;
  }

  const match = BROWSE_PATH_PATTERN.exec(parsedUrl.pathname);
  return match?.[1]?.toUpperCase() ?? null;
}

function invalidIssueInput(): InvalidIssueInput {
  return {
    ok: false,
    error: INVALID_INPUT_MESSAGE,
  };
}
