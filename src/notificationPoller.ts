import type { JiraAssignedIssue, JiraIssueActivityEntry } from './jiraClient';
import {
  computeIssueUpdateNotifications,
  createIssueActivityNotificationsSince,
  formatNotificationLogSummary,
  buildIssueUpdateBaseline,
  type IssueUpdateBaseline,
  type IssueUpdateNotificationResult,
  type JiraOpsNotificationState,
  type JiraOpsNotification,
} from './jiraNotifications';
import {
  notificationPollIntervalMs,
  type JiraOpsSettings,
} from './jiraOpsSettings';

const MAX_NOTIFICATION_HISTORY = 30;

export interface NotificationPollerOptions {
  readonly fetchIssueActivities?: (
    issueKey: string
  ) => Promise<readonly JiraIssueActivityEntry[]>;
  readonly fetchIssues: () => Promise<readonly JiraAssignedIssue[]>;
  readonly log: (message: string) => void;
  readonly onError: (error: unknown) => void;
  readonly onIssues: (issues: readonly JiraAssignedIssue[]) => void | Promise<void>;
  readonly onNotifications: (
    result: IssueUpdateNotificationResult
  ) => void | Promise<void>;
  readonly readSettings: () => Promise<JiraOpsSettings>;
  readonly resolveIntervalMs?: (settings: JiraOpsSettings) => number;
}

interface ActivityEnrichmentCandidate {
  readonly issue: JiraAssignedIssue;
  readonly notification: JiraOpsNotification;
  readonly previousUpdated: string | undefined;
}

interface ActivityEnrichmentResult {
  readonly fallback: boolean;
  readonly notifications: readonly JiraOpsNotification[];
  readonly replaceNotificationId: string;
}

export class NotificationPoller {
  private baseline: IssueUpdateBaseline = {};
  private baselineReady = false;
  private disposed = false;
  private inFlight = false;
  private notifications: readonly JiraOpsNotification[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  public constructor(private readonly options: NotificationPollerOptions) {}

  public async start(): Promise<void> {
    this.disposed = false;
    this.clearTimer();
    const settings = await this.options.readSettings();
    if (!settings.notificationsEnabled) {
      this.options.log('JiraOps notification polling is disabled.');
      return;
    }

    if (!this.baselineReady) {
      await this.pollNow('start');
    }
    this.scheduleNext(settings);
  }

  public async restart(): Promise<void> {
    this.clearTimer();
    await this.start();
  }

  public async pollNow(reason: string): Promise<boolean> {
    if (this.disposed || this.inFlight) {
      this.options.log(`Skipped JiraOps notification poll for ${reason}.`);
      return false;
    }

    this.inFlight = true;
    try {
      return await this.runPoll(reason);
    } catch (error: unknown) {
      this.options.onError(error);
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  public prime(issues: readonly JiraAssignedIssue[]): void {
    this.baseline = buildIssueUpdateBaseline(issues);
    this.baselineReady = true;
  }

  public restore(state: JiraOpsNotificationState): void {
    this.baseline = state.baseline;
    this.baselineReady = Object.keys(state.baseline).length > 0;
    this.notifications = state.notifications;
  }

  private async runPoll(reason: string): Promise<boolean> {
    const settings = await this.options.readSettings();
    if (!settings.notificationsEnabled) {
      this.options.log(`Skipped JiraOps notification poll for ${reason}: disabled.`);
      return false;
    }

    this.options.log(`Running JiraOps notification poll for ${reason}.`);
    const issues = await this.options.fetchIssues();
    this.options.log(`Fetched ${String(issues.length)} Jira issue(s) for notification poll ${reason}.`);
    await this.options.onIssues(issues);
    const previousBaseline = this.baseline;
    const result = computeIssueUpdateNotifications({
      existingNotifications: this.notifications,
      hasPreviousBaseline: this.baselineReady,
      issues,
      previousBaseline,
    });
    const enrichedResult = await this.enrichNotificationResult(
      result,
      issues,
      previousBaseline
    );
    this.baseline = enrichedResult.nextBaseline;
    this.baselineReady = true;
    this.notifications = enrichedResult.notifications;
    await this.options.onNotifications(enrichedResult);
    this.options.log(
      `JiraOps notification poll baseline now tracks ${String(Object.keys(this.baseline).length)} issue(s); history has ${String(this.notifications.length)} item(s).`
    );
    this.options.log(formatNotificationLogSummary(enrichedResult.newNotifications));
    return true;
  }

  private async enrichNotificationResult(
    result: IssueUpdateNotificationResult,
    issues: readonly JiraAssignedIssue[],
    previousBaseline: IssueUpdateBaseline
  ): Promise<IssueUpdateNotificationResult> {
    if (this.options.fetchIssueActivities === undefined) {
      return result;
    }

    const candidates = findActivityEnrichmentCandidates(
      result.newNotifications,
      issues,
      previousBaseline
    );
    if (candidates.length === 0) {
      return result;
    }

    const settled = await settleInBatches(candidates, 5, (candidate) =>
      this.enrichNotification(candidate)
    );
    return mergeEnrichedNotifications(result, settled, this.options.log);
  }

  private async enrichNotification(
    candidate: ActivityEnrichmentCandidate
  ): Promise<ActivityEnrichmentResult> {
    const activities =
      (await this.options.fetchIssueActivities?.(candidate.issue.key)) ?? [];
    const notifications = createIssueActivityNotificationsSince({
      activities,
      issue: candidate.issue,
      previousUpdated: candidate.previousUpdated,
    });

    if (notifications.length === 0) {
      return {
        fallback: true,
        notifications: [candidate.notification],
        replaceNotificationId: candidate.notification.id,
      };
    }

    return {
      fallback: false,
      notifications: notifications.map((notification) => ({
        ...notification,
        unread: candidate.notification.unread,
      })),
      replaceNotificationId: candidate.notification.id,
    };
  }

  private scheduleNext(settings: JiraOpsSettings): void {
    if (this.disposed || !settings.notificationsEnabled) {
      return;
    }

    this.timer = setTimeout(() => {
      void this.pollNow('schedule').then(() => {
        void this.reschedule();
      });
    }, this.resolveIntervalMs(settings));
  }

  private resolveIntervalMs(settings: JiraOpsSettings): number {
    return this.options.resolveIntervalMs?.(settings) ?? notificationPollIntervalMs(settings);
  }

  private async reschedule(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.scheduleNext(await this.options.readSettings());
  }

  private clearTimer(): void {
    if (this.timer === null) {
      return;
    }

    clearTimeout(this.timer);
    this.timer = null;
  }
}

function findActivityEnrichmentCandidates(
  notifications: readonly JiraOpsNotification[],
  issues: readonly JiraAssignedIssue[],
  previousBaseline: IssueUpdateBaseline
): ActivityEnrichmentCandidate[] {
  const issueByKey = new Map(issues.map((issue) => [issue.key, issue]));
  return notifications.flatMap((notification) => {
    const issue = issueByKey.get(notification.issueKey);
    if (issue === undefined) {
      return [];
    }
    return [
      {
        issue,
        notification,
        previousUpdated: previousBaseline[notification.issueKey],
      },
    ];
  });
}

async function settleInBatches<TInput, TOutput>(
  items: readonly TInput[],
  limit: number,
  task: (item: TInput) => Promise<TOutput>
): Promise<PromiseSettledResult<TOutput>[]> {
  const settled: PromiseSettledResult<TOutput>[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit);
    settled.push(...(await Promise.allSettled(batch.map(task))));
  }
  return settled;
}

function mergeEnrichedNotifications(
  result: IssueUpdateNotificationResult,
  settled: readonly PromiseSettledResult<ActivityEnrichmentResult>[],
  log: (message: string) => void
): IssueUpdateNotificationResult {
  const { replacementsById, stats } = summarizeActivityEnrichment(settled);
  log(
    `Jira activity enrichment finished: attempted=${String(stats.attempted)}, activityNotifications=${String(stats.activityNotifications)}, fallback=${String(stats.fallback)}.`
  );
  return {
    ...result,
    newNotifications: result.newNotifications.flatMap((notification) => {
      return replacementsById.get(notification.id) ?? [notification];
    }),
    notifications: result.notifications
      .flatMap((notification) => replacementsById.get(notification.id) ?? [notification])
      .slice(0, MAX_NOTIFICATION_HISTORY),
  };
}

function summarizeActivityEnrichment(
  settled: readonly PromiseSettledResult<ActivityEnrichmentResult>[]
): {
  readonly replacementsById: ReadonlyMap<string, readonly JiraOpsNotification[]>;
  readonly stats: {
    readonly activityNotifications: number;
    readonly attempted: number;
    readonly fallback: number;
  };
} {
  const replacementsById = new Map<string, readonly JiraOpsNotification[]>();
  let activityNotifications = 0;
  let fallback = 0;
  for (const item of settled) {
    if (item.status === 'rejected') {
      fallback += 1;
      continue;
    }
    replacementsById.set(item.value.replaceNotificationId, item.value.notifications);
    activityNotifications += item.value.fallback ? 0 : item.value.notifications.length;
    fallback += item.value.fallback ? 1 : 0;
  }
  return {
    replacementsById,
    stats: { activityNotifications, attempted: settled.length, fallback },
  };
}
