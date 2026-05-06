import type { OutputChannel } from 'vscode';

import {
  addJiraIssueWorklog,
  fetchJiraIssueTransitions,
  fetchJiraRemoteLinks,
  transitionJiraIssue,
  type JiraAssignedIssue,
  type JiraTokenProvider,
  type JiraTokens,
} from './jiraClient';
import {
  readCachedIssueDetailBundle,
  type CachedIssueDetailBundle,
} from './cachedIssueDetailBundle';
import {
  createDashboardIssue,
  type CloneWebLinks,
  type DashboardIssue,
} from './dashboardItems';
import {
  countInlineIssueDescriptionImages,
  countRenderedInlineIssueDescriptionImageHints,
  countUnavailableInlineIssueDescriptionImages,
  fetchJiraIssueDetail,
  hydrateIssueAttachmentImages,
  type JiraIssueDetail,
  type JiraLinkedCloneIssue,
} from './jiraIssueDetails';
import {
  runCloneMergeRequest,
  type CloneMergeRequestInput,
  type CloneMergeRequestResult,
} from './gitportClone';
import type { IssueDetailActionHandlers, IssueDetailActionResult } from './issueDetailPanel';
import {
  JiraConnectionRequiredError,
  testIssueDetailLoader,
  testRemoteLinksLoader,
  toAssignedIssue,
  webLinkHost,
} from './jiraOpsPanelSupport';
import type { RemoteWebLink } from './remoteLinks';
import { isJiraOpsTestMode } from './testModeData';
import { TtlCache, type TtlCacheResult } from './ttlCache';

const JIRA_DETAIL_CACHE_TTL_MS = 5 * 60_000;
const JIRA_REMOTE_LINK_CACHE_TTL_MS = 5 * 60_000;
const MAX_CLONE_ISSUES_TO_LOAD = 10;

export interface JiraOpsIssueDetailControllerOptions {
  readonly applyAssignedIssues: (
    issues: readonly JiraAssignedIssue[],
    source: string
  ) => void;
  readonly loadAssignedIssues: () => Promise<readonly JiraAssignedIssue[]>;
  readonly outputChannel: OutputChannel;
  readonly tokenProvider: JiraTokenProvider;
}

export class JiraOpsIssueDetailController {
  private readonly issueDetailCache = new TtlCache<JiraIssueDetail>(JIRA_DETAIL_CACHE_TTL_MS);
  private readonly remoteLinksCache = new TtlCache<readonly RemoteWebLink[]>(JIRA_REMOTE_LINK_CACHE_TTL_MS);

  public constructor(private readonly options: JiraOpsIssueDetailControllerOptions) {}

  public readCachedBundle(issue: DashboardIssue): CachedIssueDetailBundle | null {
    return readCachedIssueDetailBundle({
      detailCache: this.issueDetailCache,
      issue,
      maxCloneIssues: MAX_CLONE_ISSUES_TO_LOAD,
      remoteLinksCache: this.remoteLinksCache,
    });
  }

  public async loadBundle(issue: DashboardIssue): Promise<CachedIssueDetailBundle> {
    if (isJiraOpsTestMode()) {
      return this.loadBundleWithLoaders(issue, testIssueDetailLoader, testRemoteLinksLoader);
    }

    const tokens = await this.requireStoredTokens();
    return this.loadBundleWithLoaders(
      issue,
      (issueKey) => this.loadIssueDetailWithTokens(tokens, issueKey),
      (issueKey) => this.loadRemoteLinksWithTokens(tokens, issueKey)
    );
  }

  public createActions(): IssueDetailActionHandlers {
    return {
      cloneMergeRequest: (input) => this.cloneMergeRequest(input),
      logWork: (issueKey, minutes, comment) => this.logWork(issueKey, minutes, comment),
      transitionIssue: (issueKey, transitionId) =>
        this.transitionIssue(issueKey, transitionId),
    };
  }

  public clearCaches(): void {
    this.issueDetailCache.clear();
    this.remoteLinksCache.clear();
    this.options.outputChannel.appendLine('Cleared cached Jira issue details and remote links.');
  }

  private async loadBundleWithLoaders(
    issue: DashboardIssue,
    loadDetail: (issueKey: string) => Promise<JiraIssueDetail>,
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>
  ): Promise<CachedIssueDetailBundle> {
    const detail = await this.loadIssueDetailFromCache(issue.key, loadDetail);
    const webLinks = await this.loadRemoteLinksFromCache(issue.key, loadLinks);
    const cloneWebLinks = await this.loadCloneWebLinks(detail.linkedCloneIssues, loadLinks);
    return {
      issue: createDashboardIssue(toAssignedIssue(issue), webLinks, {
        cloneWebLinks,
        linkedCloneIssues: detail.linkedCloneIssues,
      }),
      detail,
    };
  }

  private async loadCloneWebLinks(
    cloneIssues: readonly JiraLinkedCloneIssue[],
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>
  ): Promise<CloneWebLinks[]> {
    const cloneWebLinks: CloneWebLinks[] = [];
    for (const cloneIssue of cloneIssues.slice(0, MAX_CLONE_ISSUES_TO_LOAD)) {
      cloneWebLinks.push({
        issueKey: cloneIssue.key,
        relationship: cloneIssue.relationship,
        webLinks: await this.loadRemoteLinksFromCache(cloneIssue.key, loadLinks),
      });
    }
    return cloneWebLinks;
  }

  private async loadIssueDetailFromCache(
    issueKey: string,
    loadDetail: (issueKey: string) => Promise<JiraIssueDetail>
  ): Promise<JiraIssueDetail> {
    const cached = this.issueDetailCache.get(issueKey);
    this.logCacheResult('Jira issue detail', issueKey, cached);
    if (cached.status === 'hit') {
      return cached.value;
    }

    this.options.outputChannel.appendLine(`Fetching Jira issue detail for ${issueKey}.`);
    const detail = await loadDetail(issueKey);
    this.issueDetailCache.set(issueKey, detail);
    this.options.outputChannel.appendLine(
      `Loaded Jira issue detail for ${issueKey} with ${String(detail.comments.length)} comment(s), ${String(detail.attachments.length)} attachment(s), ${String(countInlineIssueDescriptionImages(detail))} inline description image(s), ${String(countRenderedInlineIssueDescriptionImageHints(detail))} rendered inline image hint(s), and ${String(countUnavailableInlineIssueDescriptionImages(detail))} unavailable inline image placeholder(s).`
    );
    return detail;
  }

  private async loadRemoteLinksFromCache(
    issueKey: string,
    loadLinks: (issueKey: string) => Promise<RemoteWebLink[]>
  ): Promise<RemoteWebLink[]> {
    const cached = this.remoteLinksCache.get(issueKey);
    this.logCacheResult('Jira remote links', issueKey, cached);
    if (cached.status === 'hit') {
      return [...cached.value];
    }

    this.options.outputChannel.appendLine(`Fetching Jira remote links for ${issueKey}.`);
    try {
      const links = await loadLinks(issueKey);
      this.remoteLinksCache.set(issueKey, links);
      this.options.outputChannel.appendLine(`Loaded ${String(links.length)} Jira remote links for ${issueKey}.`);
      return links;
    } catch {
      this.options.outputChannel.appendLine(`Jira remote links could not be loaded for ${issueKey}.`);
      return [];
    }
  }

  private async loadIssueDetailWithTokens(
    tokens: JiraTokens,
    issueKey: string
  ): Promise<JiraIssueDetail> {
    const detail = await fetchJiraIssueDetail({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
      issueKey,
    });
    const transitions = await this.loadIssueTransitionsWithTokens(tokens, issueKey);
    this.options.outputChannel.appendLine(`Hydrating Jira issue detail image previews for ${issueKey}.`);
    const hydrated = await hydrateIssueAttachmentImages(detail, {
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
    });
    this.options.outputChannel.appendLine(
      `Hydrated ${String(countInlineIssueDescriptionImages(hydrated))} inline Jira description image(s) for ${issueKey} from ${String(countRenderedInlineIssueDescriptionImageHints(hydrated))} rendered inline image hint(s); ${String(countUnavailableInlineIssueDescriptionImages(hydrated))} inline image placeholder(s) remain unavailable.`
    );
    return { ...hydrated, transitions };
  }

  private async loadIssueTransitionsWithTokens(
    tokens: JiraTokens,
    issueKey: string
  ): Promise<JiraIssueDetail['transitions']> {
    try {
      const transitions = await fetchJiraIssueTransitions({
        accessToken: tokens.accessToken,
        cloudId: tokens.cloudId,
        issueKey,
      });
      this.options.outputChannel.appendLine(`Loaded ${String(transitions.length)} Jira issue transition(s) for ${issueKey}.`);
      return transitions;
    } catch {
      this.options.outputChannel.appendLine(`Jira issue transitions could not be loaded for ${issueKey}.`);
      return [];
    }
  }

  private async loadRemoteLinksWithTokens(
    tokens: JiraTokens,
    issueKey: string
  ): Promise<RemoteWebLink[]> {
    return fetchJiraRemoteLinks({
      accessToken: tokens.accessToken,
      cloudId: tokens.cloudId,
      issueKey,
    });
  }

  private async transitionIssue(
    issueKey: string,
    transitionId: string
  ): Promise<IssueDetailActionResult> {
    const status = this.resolveTransitionStatus(issueKey, transitionId);
    this.options.outputChannel.appendLine(`Changing Jira issue status for ${issueKey} with transition ${transitionId}.`);
    if (!isJiraOpsTestMode()) {
      const tokens = await this.requireStoredTokens();
      await transitionJiraIssue({ accessToken: tokens.accessToken, cloudId: tokens.cloudId, issueKey, transitionId });
    }
    this.issueDetailCache.delete(issueKey);
    await this.refreshDashboardAfterDetailAction();
    return { message: `Status changed to ${status.length > 0 ? status : 'the selected status'}.`, status };
  }

  private async logWork(
    issueKey: string,
    minutes: number,
    comment: string
  ): Promise<IssueDetailActionResult> {
    this.options.outputChannel.appendLine(`Logging ${String(minutes)} minute(s) of Jira work for ${issueKey}.`);
    if (!isJiraOpsTestMode()) {
      const tokens = await this.requireStoredTokens();
      await addJiraIssueWorklog({ accessToken: tokens.accessToken, cloudId: tokens.cloudId, comment, issueKey, minutes });
    }
    this.issueDetailCache.delete(issueKey);
    await this.refreshDashboardAfterDetailAction();
    return { message: `Logged ${String(minutes)} minute${minutes === 1 ? '' : 's'}.` };
  }

  private async cloneMergeRequest(
    input: CloneMergeRequestInput
  ): Promise<CloneMergeRequestResult> {
    this.options.outputChannel.appendLine(
      `Preparing GitLab merge request clone for ${input.issueKey} from ${webLinkHost(input.sourceMrUrl)}.`
    );
    return runCloneMergeRequest(input, {
      log: (message) => {
        this.options.outputChannel.appendLine(message);
      },
      testMode: isJiraOpsTestMode(),
    });
  }

  private async requireStoredTokens(): Promise<JiraTokens> {
    const tokens = await this.options.tokenProvider.getStoredOrRefreshTokens();
    if (tokens === null) {
      throw new JiraConnectionRequiredError();
    }
    return tokens;
  }

  private resolveTransitionStatus(issueKey: string, transitionId: string): string {
    const cached = this.issueDetailCache.get(issueKey);
    if (cached.status !== 'hit') {
      return '';
    }
    return cached.value.transitions.find((transition) => transition.id === transitionId)?.toStatus ?? '';
  }

  private async refreshDashboardAfterDetailAction(): Promise<void> {
    try {
      const assignedIssues = await this.options.loadAssignedIssues();
      this.options.applyAssignedIssues(assignedIssues, 'detail action');
    } catch {
      this.options.outputChannel.appendLine('Assigned Jira tickets could not be refreshed after detail action.');
    }
  }

  private logCacheResult<T>(label: string, issueKey: string, result: TtlCacheResult<T>): void {
    this.options.outputChannel.appendLine(`${label} cache ${result.status} for ${issueKey}.`);
  }
}
