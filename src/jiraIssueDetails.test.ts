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
      descriptionAdf: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Main ticket content.' }] }],
      },
      descriptionText: 'Main ticket content.',
      descriptionHtml: '<p>Main ticket content.</p>',
      activityHtml: '',
      technicalNotesHtml: '',
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
      transitions: [],
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

  test('parses sparse issue detail fields and ignores inward clone links safely', async () => {
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
      activityHtml: '',
      technicalNotesHtml: '',
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
      linkedCloneIssues: [],
      transitions: [],
    });
  });

  test('splits technical notes out of the visible issue description', async () => {
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
              updated: '2026-05-01T08:20:00.000+0000',
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Main ticket content.' }],
                  },
                  {
                    type: 'heading',
                    attrs: { level: 3 },
                    content: [{ type: 'text', text: 'Technical notes' }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Keep retry budget in place.' }],
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      );
    });

    await expect(
      fetchJiraIssueDetail({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-123',
        fetchImpl: fetchMock,
      })
    ).resolves.toMatchObject({
      activityHtml: '',
      descriptionHtml: '<p>Main ticket content.</p>',
      technicalNotesHtml: '<p>Keep retry budget in place.</p>',
    });
  });

  test('splits singular technical note headings from fetched Jira descriptions', async () => {
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
              updated: '2026-05-01T08:20:00.000+0000',
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Main ticket content.' }],
                  },
                  {
                    type: 'heading',
                    attrs: { level: 3 },
                    content: [{ type: 'text', text: 'Technical note:' }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Keep retry budget in place.' }],
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      );
    });

    await expect(
      fetchJiraIssueDetail({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-123',
        fetchImpl: fetchMock,
      })
    ).resolves.toMatchObject({
      activityHtml: '',
      descriptionHtml: '<p>Main ticket content.</p>',
      technicalNotesHtml: '<p>Keep retry budget in place.</p>',
    });
  });

  test('splits paragraph-style technical note markers from fetched Jira descriptions', async () => {
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
              updated: '2026-05-01T08:20:00.000+0000',
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'heading',
                    attrs: { level: 3 },
                    content: [{ type: 'text', text: 'Test Strategy' }],
                  },
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'Run checkout and reconciliation regression.' },
                    ],
                  },
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Technical Note:',
                        marks: [{ type: 'strong' }],
                      },
                    ],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Keep the rollback query pinned.' }],
                  },
                  {
                    type: 'heading',
                    attrs: { level: 3 },
                    content: [{ type: 'text', text: 'Rollout' }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Ship after QA sign-off.' }],
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      );
    });

    await expect(
      fetchJiraIssueDetail({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-123',
        fetchImpl: fetchMock,
      })
    ).resolves.toMatchObject({
      activityHtml: '',
      descriptionHtml:
        '<h3>Test Strategy</h3><p>Run checkout and reconciliation regression.</p><h3>Rollout</h3><p>Ship after QA sign-off.</p>',
      technicalNotesHtml: '<p>Keep the rollback query pinned.</p>',
    });
  });

  test('keeps only Jira linked work items under the clones relationship', async () => {
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
              issuelinks: [
                {
                  type: {
                    name: 'Cloners',
                    inward: 'is cloned by',
                    outward: 'clones',
                  },
                  outwardIssue: {
                    key: 'OPS-333',
                    fields: {
                      status: { name: 'In Review' },
                    },
                  },
                },
                {
                  type: {
                    name: 'Cloners',
                    inward: 'is cloned by',
                    outward: 'clones',
                  },
                  inwardIssue: {
                    key: 'OPS-222',
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

    await expect(
      fetchJiraIssueDetail({
        accessToken: 'sample-access-value',
        cloudId: 'cloud-123',
        issueKey: 'OPS-321',
        fetchImpl: fetchMock,
      })
    ).resolves.toMatchObject({
      linkedCloneIssues: [
        {
          key: 'OPS-333',
          relationship: 'clones',
          status: 'In Review',
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
      activityHtml: '',
      technicalNotesHtml: '',
      transitions: [],
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

  test('hydrates inline media in the Jira description from image attachments', async () => {
    const detail: JiraIssueDetail = {
      key: 'OPS-123',
      summary: 'Summary',
      status: 'In Progress',
      statusCategory: 'In Progress',
      priority: null,
      updated: '2026-05-01T08:20:00.000+0000',
      descriptionAdf: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before image.' }],
          },
          {
            type: 'mediaSingle',
            attrs: { layout: 'center' },
            content: [
              {
                type: 'media',
                attrs: {
                  alt: 'preview.png',
                  height: 360,
                  id: 'jira-media-id',
                  type: 'file',
                  width: 640,
                },
              },
            ],
          },
        ],
      },
      descriptionText: 'Before image.',
      descriptionHtml: '<p>Before image.</p>',
      comments: [],
      attachments: [
        {
          id: '10001',
          filename: 'preview.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
      ],
      linkedCloneIssues: [],
      activityHtml: '',
      technicalNotesHtml: '',
      transitions: [],
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
      fetchImpl: fetchMock,
    });

    expect(result.descriptionHtml).toContain(
      '<figure class="jira-adf-media jira-adf-media-single" data-layout="center"><img src="data:image/png;base64,AQID" alt="preview.png" width="640" height="360" loading="lazy" /></figure>'
    );
    expect(result.attachments[0]?.imageDataUri).toBe('data:image/png;base64,AQID');
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
