const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_WORKING_DAY = 8;
const DAYS_PER_WORKING_WEEK = 5;
const MINUTES_PER_WORKING_DAY = MINUTES_PER_HOUR * HOURS_PER_WORKING_DAY;
const MINUTES_PER_WORKING_WEEK = MINUTES_PER_WORKING_DAY * DAYS_PER_WORKING_WEEK;

interface TimeUnit {
  readonly label: string;
  readonly minutes: number;
}

const TIME_UNITS: readonly TimeUnit[] = [
  { label: 'w', minutes: MINUTES_PER_WORKING_WEEK },
  { label: 'd', minutes: MINUTES_PER_WORKING_DAY },
  { label: 'h', minutes: MINUTES_PER_HOUR },
  { label: 'm', minutes: 1 },
];

export interface FormatJiraTimeSpentOptions {
  readonly maxUnits?: number;
}

/**
 * Resolve the total seconds logged on an issue from the two Jira fields that
 * can carry it, preferring the top-level `timespent` field and falling back to
 * the `timetracking.timeSpentSeconds` value some Jira configurations populate.
 */
export function resolveTimeSpentSeconds(
  timeSpent: number | null | undefined,
  timeTrackingSeconds: number | null | undefined
): number | null {
  if (typeof timeSpent === 'number' && Number.isFinite(timeSpent)) {
    return timeSpent;
  }

  if (typeof timeTrackingSeconds === 'number' && Number.isFinite(timeTrackingSeconds)) {
    return timeTrackingSeconds;
  }

  return null;
}

/**
 * Format a total logged-work duration the way Jira reports it, using the
 * default working calendar (1d = 8h, 1w = 5d). Returns null when no positive
 * duration was logged so callers can hide the indicator entirely.
 */
export function formatJiraTimeSpent(
  totalSeconds: number | null | undefined,
  options: FormatJiraTimeSpentOptions = {}
): string | null {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return null;
  }

  let remainingMinutes = Math.round(totalSeconds / SECONDS_PER_MINUTE);
  if (remainingMinutes <= 0) {
    return null;
  }

  const parts: string[] = [];
  for (const unit of TIME_UNITS) {
    const value = Math.floor(remainingMinutes / unit.minutes);
    if (value > 0) {
      parts.push(`${String(value)}${unit.label}`);
      remainingMinutes -= value * unit.minutes;
    }
  }

  const maxUnits = options.maxUnits;
  const limitedParts =
    typeof maxUnits === 'number' && maxUnits > 0 ? parts.slice(0, maxUnits) : parts;
  return limitedParts.length > 0 ? limitedParts.join(' ') : null;
}
