import type { JiraAssignedIssue } from './jiraClient';
import {
  computeIssueUpdateNotifications,
  formatNotificationLogSummary,
  buildIssueUpdateBaseline,
  type IssueUpdateBaseline,
  type IssueUpdateNotificationResult,
  type JiraOpsNotification,
} from './jiraNotifications';
import {
  notificationPollIntervalMs,
  type JiraOpsSettings,
} from './jiraOpsSettings';

export interface NotificationPollerOptions {
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

  private async runPoll(reason: string): Promise<boolean> {
    const settings = await this.options.readSettings();
    if (!settings.notificationsEnabled) {
      this.options.log(`Skipped JiraOps notification poll for ${reason}: disabled.`);
      return false;
    }

    this.options.log(`Running JiraOps notification poll for ${reason}.`);
    const issues = await this.options.fetchIssues();
    await this.options.onIssues(issues);
    const result = computeIssueUpdateNotifications({
      existingNotifications: this.notifications,
      hasPreviousBaseline: this.baselineReady,
      issues,
      previousBaseline: this.baseline,
    });
    this.baseline = result.nextBaseline;
    this.baselineReady = true;
    this.notifications = result.notifications;
    await this.options.onNotifications(result);
    this.options.log(formatNotificationLogSummary(result.newNotifications));
    return true;
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
