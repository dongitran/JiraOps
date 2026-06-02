import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, test } from 'vitest';

import { resolveDefaultWorklogDirectory, resolveVisibleWorklogDateKeys, WorklogStore } from './worklogStore';

describe('worklog store', () => {
  test('uses ~/.jiraops on Unix-like platforms and LocalAppData on Windows', () => {
    expect(resolveDefaultWorklogDirectory('linux', {}, '/home/dev')).toBe(path.join('/home/dev', '.jiraops'));
    expect(resolveDefaultWorklogDirectory('darwin', {}, '/Users/dev')).toBe(path.join('/Users/dev', '.jiraops'));
    expect(resolveDefaultWorklogDirectory('win32', { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' }, 'C:\\Users\\dev')).toBe(
      path.join('C:\\Users\\dev\\AppData\\Local', 'JiraOps')
    );
  });

  test('shows today plus two previous workdays while skipping weekends', () => {
    expect(resolveVisibleWorklogDateKeys(new Date('2026-06-01T12:00:00.000Z'))).toEqual([
      '2026-06-01',
      '2026-05-28',
      '2026-05-29',
    ]);
  });

  test('records worklogs into daily temporary files and reads only visible days', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jiraops-worklogs-'));
    const store = new WorklogStore(directory);

    await store.recordWorklog({
      comment: 'Today work',
      issueKey: 'OPS-123',
      loggedAt: new Date('2026-06-01T10:00:00.000Z'),
      minutes: 45,
    });
    await store.recordWorklog({
      comment: 'Previous Friday work',
      issueKey: 'OPS-456',
      loggedAt: new Date('2026-05-29T11:00:00.000Z'),
      minutes: 90,
    });
    await store.recordWorklog({
      comment: 'Hidden older work',
      issueKey: 'OPS-777',
      loggedAt: new Date('2026-05-27T11:00:00.000Z'),
      minutes: 120,
    });

    await expect(fs.readFile(path.join(directory, 'worklogs-2026-06-01.json'), 'utf8')).resolves.toContain('OPS-123');
    await expect(store.readVisibleWorklogs(new Date('2026-06-01T12:00:00.000Z'))).resolves.toMatchObject([
      { issueKey: 'OPS-123', minutes: 45 },
      { issueKey: 'OPS-456', minutes: 90 },
    ]);
  });
});
