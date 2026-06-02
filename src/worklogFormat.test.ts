import { describe, expect, test } from 'vitest';

import { formatJiraTimeSpent } from './worklogFormat';

describe('formatJiraTimeSpent', () => {
  test('returns null when no positive duration was logged', () => {
    expect(formatJiraTimeSpent(null)).toBeNull();
    expect(formatJiraTimeSpent(undefined)).toBeNull();
    expect(formatJiraTimeSpent(0)).toBeNull();
    expect(formatJiraTimeSpent(-3600)).toBeNull();
    expect(formatJiraTimeSpent(Number.NaN)).toBeNull();
    expect(formatJiraTimeSpent(20)).toBeNull();
  });

  test('formats minutes and hours from seconds', () => {
    expect(formatJiraTimeSpent(1800)).toBe('30m');
    expect(formatJiraTimeSpent(3600)).toBe('1h');
    expect(formatJiraTimeSpent(12_600)).toBe('3h 30m');
  });

  test('uses the Jira working calendar of 8h per day and 5d per week', () => {
    expect(formatJiraTimeSpent(28_800)).toBe('1d');
    expect(formatJiraTimeSpent(30_600)).toBe('1d 30m');
    expect(formatJiraTimeSpent(144_000)).toBe('1w');
    expect(formatJiraTimeSpent(147_600)).toBe('1w 1h');
  });

  test('limits the rendered units when a maximum is provided', () => {
    expect(formatJiraTimeSpent(147_600, { maxUnits: 1 })).toBe('1w');
    expect(formatJiraTimeSpent(95_400, { maxUnits: 2 })).toBe('3d 2h');
    expect(formatJiraTimeSpent(95_460, { maxUnits: 2 })).toBe('3d 2h');
  });

  test('rounds partial minutes to the nearest minute', () => {
    expect(formatJiraTimeSpent(110)).toBe('2m');
    expect(formatJiraTimeSpent(89)).toBe('1m');
  });
});
