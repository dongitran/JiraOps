import { describe, expect, test, vi } from 'vitest';

import {
  GITPORT_GITLAB_TOKEN_ENV,
  buildCloneMergeRequestCommand,
  buildCloneMergeRequestDefaults,
  buildDestinationRepoUrl,
  buildGitportCommandPreview,
  runCloneMergeRequest,
} from './gitportClone';

const sourceMrUrl =
  'https://gitlab.dongtran.com/group-a/folder/main/repository-1/-/merge_requests/100';

describe('gitport clone helpers', () => {
  test('builds clone defaults from a source merge request title and Jira issue key', () => {
    expect(buildCloneMergeRequestDefaults('Merge request - TOR-45', 'POR-10')).toEqual({
      baseBranch: 'staging',
      portBranch: 'cherry-pick/POR-10',
      title: '[Clone] TOR-45 POR-10',
    });
    expect(buildCloneMergeRequestDefaults('Backport alert window tuning', 'OPS-123')).toMatchObject({
      title: '[Clone] Backport alert window tuning OPS-123',
    });
  });

  test('derives the destination repository by replacing the first source group segment', () => {
    expect(buildDestinationRepoUrl(sourceMrUrl, 'group-b')).toBe(
      'https://gitlab.dongtran.com/group-b/folder/main/repository-1'
    );
    expect(buildDestinationRepoUrl(sourceMrUrl, 'parent/group-b')).toBe(
      'https://gitlab.dongtran.com/parent/group-b/folder/main/repository-1'
    );
  });

  test('builds a sanitized gitport command preview without a token', () => {
    const command = buildCloneMergeRequestCommand({
      baseBranch: 'staging',
      destinationGroup: 'group-b',
      issueKey: 'POR-10',
      portBranch: 'cherry-pick/POR-10',
      sourceMrTitle: 'Merge request - TOR-45',
      sourceMrUrl,
      title: '[Clone] TOR-45 POR-10',
    });

    expect(command).toMatchObject({
      baseBranch: 'staging',
      destinationRepoUrl: 'https://gitlab.dongtran.com/group-b/folder/main/repository-1',
      portBranch: 'cherry-pick/POR-10',
      sourceMergeRequestIid: 100,
      sourceRepoUrl: 'https://gitlab.dongtran.com/group-a/folder/main/repository-1',
    });
    expect(buildGitportCommandPreview(command)).toBe(
      "gitport --source-mr-url https://gitlab.dongtran.com/group-a/folder/main/repository-1/-/merge_requests/100 --destination-repo-url https://gitlab.dongtran.com/group-b/folder/main/repository-1 --base-branch staging --port-branch cherry-pick/POR-10 --title '[Clone] TOR-45 POR-10'"
    );
  });

  test('rejects malformed clone inputs before running gitport', () => {
    expect(() => buildDestinationRepoUrl(sourceMrUrl, '../group-b')).toThrow(
      'Destination group must contain valid GitLab path segments.'
    );
    expect(() =>
      buildCloneMergeRequestCommand({
        baseBranch: 'staging',
        destinationGroup: 'group-b',
        issueKey: 'POR-10',
        portBranch: 'staging',
        sourceMrTitle: 'Merge request - TOR-45',
        sourceMrUrl,
        title: '[Clone] TOR-45 POR-10',
      })
    ).toThrow('Base branch and port branch must differ.');
    expect(() => buildDestinationRepoUrl('file:///tmp/repo/-/merge_requests/1', 'group-b')).toThrow(
      'Source URL must be an HTTP or HTTPS URL.'
    );
  });

  test('simulates clone results in JiraOps test mode without importing gitport', async () => {
    const importGitport = vi.fn();
    const log = vi.fn<(message: string) => void>();

    await expect(
      runCloneMergeRequest(
        {
          baseBranch: 'staging',
          destinationGroup: 'group-b',
          issueKey: 'POR-10',
          portBranch: 'cherry-pick/POR-10',
          sourceMrTitle: 'Merge request - TOR-45',
          sourceMrUrl,
          title: '[Clone] TOR-45 POR-10',
        },
        {
          importGitport,
          log,
          testMode: true,
        }
      )
    ).resolves.toEqual({
      mergeRequestIid: 777,
      mergeRequestUrl:
        'https://gitlab.dongtran.com/group-b/folder/main/repository-1/-/merge_requests/777',
      message: 'Cloned merge request !777.',
    });
    expect(importGitport).not.toHaveBeenCalled();
    expect(log.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining('gitport --source-mr-url'),
      expect.stringContaining('Gitport clone simulated for POR-10'),
    ]);
  });

  test('requires a GitLab token outside JiraOps test mode', async () => {
    await expect(
      runCloneMergeRequest(
        {
          baseBranch: 'staging',
          destinationGroup: 'group-b',
          issueKey: 'POR-10',
          portBranch: 'cherry-pick/POR-10',
          sourceMrTitle: 'Merge request - TOR-45',
          sourceMrUrl,
          title: '[Clone] TOR-45 POR-10',
        },
        {
          env: { [GITPORT_GITLAB_TOKEN_ENV]: '' },
          log: vi.fn(),
          testMode: false,
        }
      )
    ).rejects.toThrow(`Set ${GITPORT_GITLAB_TOKEN_ENV}`);
  });
});
