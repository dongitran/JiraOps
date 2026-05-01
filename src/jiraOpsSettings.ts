export const JIRA_OPS_SETTINGS_STATE_KEY = 'jiraOps.settings.v1';
export const DEFAULT_NOTIFICATION_POLL_INTERVAL_MINUTES = 1;
export const MIN_NOTIFICATION_POLL_INTERVAL_MINUTES = 1;
export const MAX_NOTIFICATION_POLL_INTERVAL_MINUTES = 60;

export interface JiraOpsSettings {
  readonly notificationsEnabled: boolean;
  readonly notificationPollIntervalMinutes: number;
}

export interface JiraOpsSettingsMemento {
  get(key: string): unknown;
  update(key: string, value: unknown): Thenable<void>;
}

export function normalizeJiraOpsSettings(value: unknown): JiraOpsSettings {
  if (!isRecord(value)) {
    return defaultJiraOpsSettings();
  }

  const interval = parseNotificationPollIntervalMinutes(
    value['notificationPollIntervalMinutes']
  );
  return {
    notificationsEnabled:
      typeof value['notificationsEnabled'] === 'boolean'
        ? value['notificationsEnabled']
        : true,
    notificationPollIntervalMinutes:
      interval ?? DEFAULT_NOTIFICATION_POLL_INTERVAL_MINUTES,
  };
}

export function parseNotificationPollIntervalMinutes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }

  if (
    value < MIN_NOTIFICATION_POLL_INTERVAL_MINUTES ||
    value > MAX_NOTIFICATION_POLL_INTERVAL_MINUTES
  ) {
    return null;
  }

  return value;
}

export function readJiraOpsSettings(
  memento: JiraOpsSettingsMemento
): JiraOpsSettings {
  return normalizeJiraOpsSettings(memento.get(JIRA_OPS_SETTINGS_STATE_KEY));
}

export async function writeJiraOpsSettings(
  memento: JiraOpsSettingsMemento,
  settings: JiraOpsSettings
): Promise<JiraOpsSettings> {
  const normalized = normalizeJiraOpsSettings(settings);
  await memento.update(JIRA_OPS_SETTINGS_STATE_KEY, normalized);
  return normalized;
}

export function notificationPollIntervalMs(settings: JiraOpsSettings): number {
  return settings.notificationPollIntervalMinutes * 60_000;
}

function defaultJiraOpsSettings(): JiraOpsSettings {
  return {
    notificationsEnabled: true,
    notificationPollIntervalMinutes: DEFAULT_NOTIFICATION_POLL_INTERVAL_MINUTES,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
