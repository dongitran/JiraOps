export const GITPORT_GITLAB_TOKEN_ENV = 'GITPORT_GITLAB_TOKEN';
export const DEFAULT_CLONE_BASE_BRANCH = 'staging';
export const CLONE_BASE_BRANCH_OPTIONS = [
  'staging',
  'main',
  'develop',
  'master',
  'release',
] as const;

export interface CloneMergeRequestInput {
  readonly baseBranch: string;
  readonly destinationGroup: string;
  readonly issueKey: string;
  readonly portBranch: string;
  readonly sourceMrTitle: string;
  readonly sourceMrUrl: string;
  readonly title: string;
}

export interface CloneMergeRequestDefaults {
  readonly baseBranch: string;
  readonly portBranch: string;
  readonly title: string;
}

export interface CloneMergeRequestCommand {
  readonly baseBranch: string;
  readonly destinationRepoUrl: string;
  readonly portBranch: string;
  readonly sourceMergeRequestIid: number;
  readonly sourceMrUrl: string;
  readonly sourceRepoUrl: string;
  readonly title: string;
}

export interface CloneMergeRequestResult {
  readonly mergeRequestCreated: boolean;
  readonly mergeRequestIid?: number | undefined;
  readonly mergeRequestUrl?: string | undefined;
  readonly message: string;
  readonly portBranch: string;
}

export interface RunCloneMergeRequestOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly importGitport?: () => Promise<GitportModule>;
  readonly log: (message: string) => void;
  readonly testMode: boolean;
}

interface GitportModule {
  readonly maskGitportError: (error: unknown, secrets: readonly string[]) => string;
  readonly portGitLabMergeRequest: (
    options: GitportPortOptions
  ) => Promise<GitportPortResult>;
}

interface GitportPortOptions {
  readonly baseBranch: string;
  readonly destRepo: string;
  readonly portBranch: string;
  readonly sourceMergeRequestIid: number;
  readonly sourceRepo: string;
  readonly title: string;
  readonly token?: string | undefined;
}

interface GitportPortResult {
  readonly mergeRequestCreated: boolean;
  readonly mergeRequestIid?: number | undefined;
  readonly mergeRequestUrl?: string | undefined;
  readonly portBranch: string;
  readonly portBranchExisted: boolean;
}

interface ParsedMergeRequestUrl {
  readonly repoPathParts: readonly string[];
  readonly sourceMergeRequestIid: number;
  readonly sourceRepoUrl: string;
}

const MERGE_REQUEST_PATH_MARKER = '/-/merge_requests/';
const ISSUE_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/u;
const MERGE_REQUEST_TITLE_KEY_PATTERN = /merge request\s*-\s*([A-Z][A-Z0-9]+-\d+)/iu;
const GROUP_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/u;

export function buildCloneMergeRequestDefaults(
  sourceMrTitle: string,
  issueKey: string
): CloneMergeRequestDefaults {
  return {
    baseBranch: DEFAULT_CLONE_BASE_BRANCH,
    portBranch: `cherry-pick/${issueKey}`,
    title: `[Clone] ${resolveCloneTitleSource(sourceMrTitle)} ${issueKey}`,
  };
}

export function buildCloneMergeRequestCommand(
  input: CloneMergeRequestInput
): CloneMergeRequestCommand {
  requireNonEmpty(input.issueKey, 'Issue key');
  const sourceMrUrl = requireNonEmpty(input.sourceMrUrl, 'Source merge request URL');
  const baseBranch = requireBranch(input.baseBranch, 'Base branch');
  const portBranch = requireBranch(input.portBranch, 'Port branch');
  const title = requireNonEmpty(input.title, 'Title');
  if (baseBranch === portBranch) {
    throw new Error('Base branch and port branch must differ.');
  }

  const parsed = parseMergeRequestUrl(sourceMrUrl);
  return {
    baseBranch,
    destinationRepoUrl: buildDestinationRepoUrl(sourceMrUrl, input.destinationGroup),
    portBranch,
    sourceMergeRequestIid: parsed.sourceMergeRequestIid,
    sourceMrUrl,
    sourceRepoUrl: parsed.sourceRepoUrl,
    title,
  };
}

export function buildGitportCommandPreview(command: CloneMergeRequestCommand): string {
  return [
    'gitport',
    '--source-mr-url',
    shellQuote(command.sourceMrUrl),
    '--destination-repo-url',
    shellQuote(command.destinationRepoUrl),
    '--base-branch',
    shellQuote(command.baseBranch),
    '--port-branch',
    shellQuote(command.portBranch),
    '--title',
    shellQuote(command.title),
  ].join(' ');
}

export async function runCloneMergeRequest(
  input: CloneMergeRequestInput,
  options: RunCloneMergeRequestOptions
): Promise<CloneMergeRequestResult> {
  const command = buildCloneMergeRequestCommand(input);
  options.log(`Gitport command: ${buildGitportCommandPreview(command)}.`);
  if (options.testMode) {
    await waitForTestCloneDelay(options.env ?? process.env);
    const result = simulateCloneMergeRequest(command);
    options.log(`Gitport clone simulated for ${input.issueKey}; created ${result.mergeRequestUrl ?? result.portBranch}.`);
    return result;
  }

  return runRealCloneMergeRequest(command, options);
}

export function buildDestinationRepoUrl(
  sourceMrUrl: string,
  destinationGroup: string
): string {
  const parsed = parseMergeRequestUrl(sourceMrUrl);
  const destinationGroupParts = parseDestinationGroup(destinationGroup);
  if (parsed.repoPathParts.length < 2) {
    throw new Error('Source merge request URL must include a group and repository path.');
  }

  const url = new URL(sourceMrUrl);
  url.pathname = `/${[...destinationGroupParts, ...parsed.repoPathParts.slice(1)].join('/')}`;
  url.search = '';
  url.hash = '';
  return stripTrailingSlash(url.toString());
}

function resolveCloneTitleSource(sourceMrTitle: string): string {
  const mergeRequestKey = MERGE_REQUEST_TITLE_KEY_PATTERN.exec(sourceMrTitle)?.[1];
  if (mergeRequestKey !== undefined) {
    return mergeRequestKey.toUpperCase();
  }

  return ISSUE_KEY_PATTERN.exec(sourceMrTitle)?.[1] ?? sourceMrTitle;
}

async function runRealCloneMergeRequest(
  command: CloneMergeRequestCommand,
  options: RunCloneMergeRequestOptions
): Promise<CloneMergeRequestResult> {
  const env = options.env ?? process.env;
  const token = env[GITPORT_GITLAB_TOKEN_ENV];
  if (token === undefined || token.length === 0) {
    throw new Error(`GitLab token is required. Set ${GITPORT_GITLAB_TOKEN_ENV} before cloning merge requests.`);
  }

  const gitport = await (options.importGitport ?? importGitport)();
  try {
    const result = await gitport.portGitLabMergeRequest({
      baseBranch: command.baseBranch,
      destRepo: command.destinationRepoUrl,
      portBranch: command.portBranch,
      sourceMergeRequestIid: command.sourceMergeRequestIid,
      sourceRepo: command.sourceRepoUrl,
      title: command.title,
      token,
    });
    const cloneResult = toCloneResult(result);
    options.log(
      cloneResult.mergeRequestCreated
        ? `Gitport clone completed; created ${cloneResult.mergeRequestUrl ?? cloneResult.portBranch}.`
        : `Gitport clone completed; updated existing port branch ${cloneResult.portBranch}.`
    );
    return cloneResult;
  } catch (error: unknown) {
    throw new Error(gitport.maskGitportError(error, [token]));
  }
}

async function importGitport(): Promise<GitportModule> {
  return import('@saptools/gitport');
}

function simulateCloneMergeRequest(command: CloneMergeRequestCommand): CloneMergeRequestResult {
  return toCloneResult({
    mergeRequestCreated: true,
    mergeRequestIid: 777,
    mergeRequestUrl: `${command.destinationRepoUrl}/-/merge_requests/777`,
    portBranch: command.portBranch,
    portBranchExisted: false,
  });
}

function toCloneResult(result: GitportPortResult): CloneMergeRequestResult {
  if (!result.mergeRequestCreated) {
    return {
      mergeRequestCreated: false,
      message: `Updated existing port branch ${result.portBranch}.`,
      portBranch: result.portBranch,
    };
  }
  if (result.mergeRequestUrl === undefined || result.mergeRequestIid === undefined) {
    throw new Error('Gitport did not return the created merge request link.');
  }

  return {
    mergeRequestCreated: true,
    mergeRequestIid: result.mergeRequestIid,
    mergeRequestUrl: result.mergeRequestUrl,
    message: `Cloned merge request !${String(result.mergeRequestIid)}.`,
    portBranch: result.portBranch,
  };
}

function parseMergeRequestUrl(sourceMrUrl: string): ParsedMergeRequestUrl {
  const url = parseHttpUrl(sourceMrUrl);
  const markerIndex = url.pathname.indexOf(MERGE_REQUEST_PATH_MARKER);
  if (markerIndex < 0) {
    throw new Error('Source URL must be a GitLab merge request URL.');
  }

  const iid = parseMergeRequestIid(url.pathname.slice(markerIndex + MERGE_REQUEST_PATH_MARKER.length));
  const sourceRepoUrl = new URL(sourceMrUrl);
  sourceRepoUrl.pathname = url.pathname.slice(0, markerIndex);
  sourceRepoUrl.search = '';
  sourceRepoUrl.hash = '';
  return {
    repoPathParts: sourceRepoUrl.pathname.split('/').filter((part) => part.length > 0),
    sourceMergeRequestIid: iid,
    sourceRepoUrl: stripTrailingSlash(sourceRepoUrl.toString()),
  };
}

function parseHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Source URL must be a valid web URL.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Source URL must be an HTTP or HTTPS URL.');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('Source URL must not include embedded credentials.');
  }
  return url;
}

function parseMergeRequestIid(value: string): number {
  const raw = value.split('/')[0] ?? '';
  if (!/^[1-9]\d*$/u.test(raw)) {
    throw new Error('Source URL must include a merge request number.');
  }

  const iid = Number(raw);
  if (!Number.isSafeInteger(iid)) {
    throw new Error('Source URL merge request number is too large.');
  }
  return iid;
}

function parseDestinationGroup(value: string): string[] {
  const group = requireNonEmpty(value, 'Destination group');
  const parts = group.split('/').filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some(isInvalidDestinationGroupSegment)) {
    throw new Error('Destination group must contain valid GitLab path segments.');
  }

  return parts.map(encodeURIComponent);
}

async function waitForTestCloneDelay(env: NodeJS.ProcessEnv): Promise<void> {
  const delayMs = parseNonNegativeInteger(env['JIRA_OPS_TEST_GITPORT_CLONE_DELAY_MS']);
  if (delayMs === 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function parseNonNegativeInteger(value: string | undefined): number {
  if (value === undefined || !/^\d+$/u.test(value)) {
    return 0;
  }

  return Number(value);
}

function isInvalidDestinationGroupSegment(segment: string): boolean {
  return segment === '.' || segment === '..' || !GROUP_SEGMENT_PATTERN.test(segment);
}

function requireBranch(value: string, label: string): string {
  const branch = requireNonEmpty(value, label);
  if (branch.startsWith('-') || branch.includes('@{') || /\s/u.test(branch)) {
    throw new Error(`${label} is not a valid branch name.`);
  }
  return branch;
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}
