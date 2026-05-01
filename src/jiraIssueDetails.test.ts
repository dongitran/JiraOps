import { describe, expect, test, vi } from 'vitest';

import {
  buildJiraAttachmentThumbnailUrl,
  buildJiraIssueDetailUrl,
  extractTextFromAdf,
  fetchJiraAttachmentImageDataUri,
  fetchJiraIssueDetail,
  hydrateIssueAttachmentImages,
  type JiraIssueDetail,
} from './jiraIssueDetails';

describe('jira issue details', () => {
  test('builds issue detail and attachment thumbnail URLs safely', () => {
    expect(buildJiraIssueDetailUrl('cloud-123', 'OPS-123')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123?fields=summary%2Cstatus%2Cpriority%2Cupdated%2Cdescription%2Ccomment%2Cattachment%2Cissuelinks'
    );
    expect(buildJiraAttachmentThumbnailUrl('cloud-123', '10001')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/thumbnail/10001?redirect=false'
    );
  });

  test('extracts readable text from Atlassian document format content', () => {
    const text = extractTextFromAdf({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Check the deployment ' },
            { type: 'text', text: 'runbook' },
            { type: 'hardBreak' },
            { type: 'text', text: 'before approving.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Verify alerts' }] }],
            },
          ],
        },
      ],
    });

    expect(text).toBe('Check the deployment runbook\nbefore approving.\nVerify alerts');
  });

  test('fetches and parses issue detail content, attachments, and clone issue links', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            key: 'OPS-123',
            fields: {
              summary: 'Stabilize payment reconciliation alerts',
              status: {
                name: 'In Progress',
                statusCategory: { name: 'In Progress' },
              },
              priority: { name: 'High' },
              updated: '2026-05-01T08:20:00.000+0000',
              description: {
                type: 'doc',
                version: 1,
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Main ticket content.' }] }],
              },
              comment: {
                comments: [
                  {
                    id: 'comment-1',
                    author: { displayName: 'Current User' },
                    body: {
                      type: 'doc',
                      version: 1,
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Latest review note.' }] }],
                    },
                    created: '2026-05-01T08:30:00.000+0000',
                  },
                ],
              },
              attachment: [
                {
                  id: '10001',
                  filename: 'preview.png',
                  mimeType: 'image/png',
                  size: 23123,
                },
              ],
              issuelinks: [
                {
                  type: {
                    name: 'Cloners',
                    inward: 'is cloned by',
                    outward: 'clones',
                  },
                  outwardIssue: {
                    key: 'OPS-111',
                    fields: {
                      status: { name: 'Code Review' },
                    },
                  },
                },
              ],
            },
          }),
          { status: 200 }
        )
      );
    });

    const result = await fetchJiraIssueDetail({
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      issueKey: 'OPS-123',
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      key: 'OPS-123',
      summary: 'Stabilize payment reconciliation alerts',
      status: 'In Progress',
      statusCategory: 'In Progress',
      priority: 'High',
      updated: '2026-05-01T08:20:00.000+0000',
      descriptionText: 'Main ticket content.',
      descriptionHtml: '<p>Main ticket content.</p>',
      comments: [
        {
          id: 'comment-1',
          authorDisplayName: 'Current User',
          bodyText: 'Latest review note.',
          bodyHtml: '<p>Latest review note.</p>',
          created: '2026-05-01T08:30:00.000+0000',
        },
      ],
      attachments: [
        {
          id: '10001',
          filename: 'preview.png',
          mimeType: 'image/png',
          size: 23123,
          imageDataUri: null,
        },
      ],
      linkedCloneIssues: [
        {
          key: 'OPS-111',
          relationship: 'clones',
          status: 'Code Review',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123?fields=summary%2Cstatus%2Cpriority%2Cupdated%2Cdescription%2Ccomment%2Cattachment%2Cissuelinks',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer sample-access-value',
        },
      }
    );
  });

  test('fetches an image attachment thumbnail as a bounded data URI', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      );
    });

    const result = await fetchJiraAttachmentImageDataUri({
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      attachmentId: '10001',
      maxBytes: 64,
      fetchImpl: fetchMock,
    });

    expect(result).toBe('data:image/png;base64,AQID');
  });

  test('does not return a data URI for non-image or oversized attachment responses', async () => {
    const nonImageFetch = vi.fn(() => {
      return Promise.resolve(
        new Response('not an image', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      );
    });
    const oversizedFetch = vi.fn(() => {
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      );
    });

    await expect(
      fetchJiraAttachmentImageDataUri({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        attachmentId: '10001',
        fetchImpl: nonImageFetch,
      })
    ).resolves.toBeNull();
    await expect(
      fetchJiraAttachmentImageDataUri({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        attachmentId: '10001',
        maxBytes: 3,
        fetchImpl: oversizedFetch,
      })
    ).resolves.toBeNull();
  });

  test('parses sparse issue detail fields and inward clone links safely', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            key: 'OPS-321',
            fields: {
              summary: 'Follow cloned inventory reservation cleanup',
              status: {
                name: 'In Review',
                statusCategory: { name: 'In Progress' },
              },
              priority: null,
              updated: '2026-05-01T05:15:00.000+0000',
              description: null,
              comment: [
                {
                  id: 2,
                },
              ],
              attachment: [
                {
                  id: 10002,
                  filename: 'notes.txt',
                  mimeType: 'text/plain',
                },
              ],
              issuelinks: [
                {
                  type: {
                    name: 'Relates',
                    inward: 'relates to',
                    outward: 'relates to',
                  },
                  outwardIssue: { key: 'OPS-999' },
                },
                {
                  type: {
                    name: 'Cloners',
                    inward: 'is cloned by',
                    outward: 'clones',
                  },
                  inwardIssue: { key: 'OPS-222' },
                },
              ],
            },
          }),
          { status: 200 }
        )
      );
    });

    const result = await fetchJiraIssueDetail({
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      issueKey: 'OPS-321',
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({
      priority: null,
      descriptionText: '',
      descriptionHtml: '',
      comments: [
        {
          id: '2',
          authorDisplayName: 'Unknown author',
          bodyText: '',
          bodyHtml: '',
          created: '',
        },
      ],
      attachments: [
        {
          id: '10002',
          filename: 'notes.txt',
          mimeType: 'text/plain',
          size: 0,
        },
      ],
      linkedCloneIssues: [
        {
          key: 'OPS-222',
          relationship: 'is cloned by',
          status: null,
        },
      ],
    });
  });

  test('hydrates only bounded image attachments in issue detail content', async () => {
    const detail: JiraIssueDetail = {
      key: 'OPS-123',
      summary: 'Summary',
      status: 'In Progress',
      statusCategory: 'In Progress',
      priority: null,
      updated: '2026-05-01T08:20:00.000+0000',
      descriptionText: '',
      descriptionHtml: '',
      comments: [],
      attachments: [
        {
          id: '10001',
          filename: 'preview.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
        {
          id: '10002',
          filename: 'notes.txt',
          mimeType: 'text/plain',
          size: 100,
          imageDataUri: null,
        },
      ],
      linkedCloneIssues: [],
    };
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      );
    });

    const result = await hydrateIssueAttachmentImages(detail, {
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      maxImages: 1,
      fetchImpl: fetchMock,
    });

    expect(result.attachments[0]?.imageDataUri).toBe('data:image/png;base64,AQID');
    expect(result.attachments[1]?.imageDataUri).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('throws neutral errors for unsuccessful or malformed issue detail responses', async () => {
    const failedFetch = vi.fn(() => {
      return Promise.resolve(new Response('denied', { status: 403 }));
    });
    const malformedFetch = vi.fn(() => {
      return Promise.resolve(new Response(JSON.stringify({ fields: {} }), { status: 200 }));
    });

    await expect(
      fetchJiraIssueDetail({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-123',
        fetchImpl: failedFetch,
      })
    ).rejects.toThrow('Jira issue detail could not be loaded.');
    await expect(
      fetchJiraIssueDetail({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-123',
        fetchImpl: malformedFetch,
      })
    ).rejects.toThrow('Jira issue detail response was not valid.');
  });

  test('does not return a data URI when the attachment thumbnail request fails', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    await expect(
      fetchJiraAttachmentImageDataUri({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        attachmentId: '10001',
        fetchImpl: fetchMock,
      })
    ).resolves.toBeNull();
  });
});
