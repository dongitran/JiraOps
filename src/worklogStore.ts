import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export interface WorklogEntry {
  readonly comment: string;
  readonly id: string;
  readonly issueKey: string;
  readonly loggedAt: string;
  readonly minutes: number;
}

export interface RecordWorklogInput {
  readonly comment: string;
  readonly issueKey: string;
  readonly loggedAt?: Date;
  readonly minutes: number;
}

const WORKLOG_FILE_PREFIX = 'worklogs-';
const WORKLOG_FILE_SUFFIX = '.json';
const WEEKEND_DAY_INDICES = new Set([0, 6]);

export class WorklogStore {
  public constructor(private readonly directory = resolveDefaultWorklogDirectory()) {}

  public async recordWorklog(input: RecordWorklogInput): Promise<WorklogEntry> {
    const loggedAt = input.loggedAt ?? new Date();
    const entry: WorklogEntry = {
      comment: input.comment,
      id: createWorklogId(input.issueKey, loggedAt),
      issueKey: input.issueKey,
      loggedAt: loggedAt.toISOString(),
      minutes: input.minutes,
    };
    const dateKey = toLocalDateKey(loggedAt);
    const entries = await this.readEntriesForDate(dateKey);
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(
      this.filePathForDate(dateKey),
      `${JSON.stringify([...entries, entry], null, 2)}\n`,
      'utf8'
    );
    return entry;
  }

  public async readVisibleWorklogs(today = new Date()): Promise<readonly WorklogEntry[]> {
    const dateKeys = resolveVisibleWorklogDateKeys(today);
    const groupedEntries = await Promise.all(dateKeys.map((dateKey) => this.readEntriesForDate(dateKey)));
    return groupedEntries.flat().sort(compareWorklogsByLoggedAtDescending);
  }

  public get storageDirectory(): string {
    return this.directory;
  }

  private async readEntriesForDate(dateKey: string): Promise<WorklogEntry[]> {
    try {
      const raw = await fs.readFile(this.filePathForDate(dateKey), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isWorklogEntry) : [];
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private filePathForDate(dateKey: string): string {
    return path.join(this.directory, `${WORKLOG_FILE_PREFIX}${dateKey}${WORKLOG_FILE_SUFFIX}`);
  }
}

export function resolveDefaultWorklogDirectory(platform = process.platform, env = process.env, homeDirectory = os.homedir()): string {
  if (platform === 'win32') {
    return path.join(env['LOCALAPPDATA'] ?? path.join(homeDirectory, 'AppData', 'Local'), 'JiraOps');
  }

  return path.join(homeDirectory, '.jiraops');
}

export function resolveVisibleWorklogDateKeys(today: Date): readonly string[] {
  const previousWorkdays: string[] = [];
  const cursor = new Date(today);
  while (previousWorkdays.length < 2) {
    cursor.setDate(cursor.getDate() - 1);
    if (WEEKEND_DAY_INDICES.has(cursor.getDay())) {
      continue;
    }
    previousWorkdays.push(toLocalDateKey(cursor));
  }
  return [toLocalDateKey(today), ...previousWorkdays.reverse()];
}

export function toLocalDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createWorklogId(issueKey: string, loggedAt: Date): string {
  return `${issueKey}-${loggedAt.toISOString().replace(/[^A-Za-z0-9]/gu, '-')}`;
}

function compareWorklogsByLoggedAtDescending(left: WorklogEntry, right: WorklogEntry): number {
  return new Date(right.loggedAt).getTime() - new Date(left.loggedAt).getTime();
}

function isWorklogEntry(value: unknown): value is WorklogEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<WorklogEntry>;
  return (
    typeof candidate.comment === 'string' &&
    typeof candidate.id === 'string' &&
    typeof candidate.issueKey === 'string' &&
    typeof candidate.loggedAt === 'string' &&
    typeof candidate.minutes === 'number' &&
    Number.isInteger(candidate.minutes) &&
    candidate.minutes >= 1 &&
    candidate.minutes <= 1440
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
