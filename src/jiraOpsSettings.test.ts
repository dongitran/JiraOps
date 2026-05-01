import { describe, expect, test } from 'vitest';

import {
  DEFAULT_NOTIFICATION_POLL_INTERVAL_MINUTES,
  JIRA_OPS_SETTINGS_STATE_KEY,
  normalizeJiraOpsSettings,
  parseNotificationPollIntervalMinutes,
  readJiraOpsSettings,
  writeJiraOpsSettings,
} from './jiraOpsSettings';

class MemoryMemento {
  private readonly values: Record<string, unknown> = {};

  public get(key: string): unknown {
    return this.values[key];
  }

  public update(key: string, value: unknown): Promise<void> {
    this.values[key] = value;
    return Promise.resolve();
  }
}

describe('JiraOps settings', () => {
  test('uses a 1 minute notification poll interval by default', () => {
    expect(normalizeJiraOpsSettings(undefined)).toEqual({
      notificationsEnabled: true,
      notificationPollIntervalMinutes: DEFAULT_NOTIFICATION_POLL_INTERVAL_MINUTES,
    });
  });

  test('falls back when persisted notification settings are malformed', async () => {
    const memento = new MemoryMemento();
    await memento.update(JIRA_OPS_SETTINGS_STATE_KEY, {
      notificationsEnabled: 'yes',
      notificationPollIntervalMinutes: 0,
    });

    expect(readJiraOpsSettings(memento)).toEqual({
      notificationsEnabled: true,
      notificationPollIntervalMinutes: 1,
    });
  });

  test('accepts only supported polling intervals', () => {
    expect(parseNotificationPollIntervalMinutes(1)).toBe(1);
    expect(parseNotificationPollIntervalMinutes(60)).toBe(60);
    expect(parseNotificationPollIntervalMinutes(0)).toBeNull();
    expect(parseNotificationPollIntervalMinutes(61)).toBeNull();
    expect(parseNotificationPollIntervalMinutes(1.5)).toBeNull();
  });

  test('persists disabled notification polling', async () => {
    const memento = new MemoryMemento();
    await writeJiraOpsSettings(memento, {
      notificationsEnabled: false,
      notificationPollIntervalMinutes: 5,
    });

    expect(readJiraOpsSettings(memento)).toEqual({
      notificationsEnabled: false,
      notificationPollIntervalMinutes: 5,
    });
  });
});
