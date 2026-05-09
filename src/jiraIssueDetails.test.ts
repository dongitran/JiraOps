import { describe, expect, test, vi } from 'vitest';

import {
  buildJiraAttachmentContentUrl,
  buildJiraAttachmentThumbnailUrl,
  buildJiraIssueDetailUrl,
  extractTextFromAdf,
  fetchJiraAttachmentImageDataUri,
  fetchJiraIssueDetail,
  hydrateIssueAttachmentImages,
  type JiraIssueDetail,
} from './jiraIssueDetails';

function createHydrationDetail(overrides: Partial<JiraIssueDetail> = {}): JiraIssueDetail {
  return {
    key: 'OPS-123',
    summary: 'Summary',
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: null,
    updated: '2026-05-01T08:20:00.000+0000',
    descriptionAdf: {
      type: 'doc',
      version: 1,
      content: [],
    },
    descriptionText: '',
    descriptionHtml: '',
    comments: [],
    attachments: [],
    linkedCloneIssues: [],
    activityHtml: '',
    technicalNotesHtml: '',
    transitions: [],
    ...overrides,
  };
}

function createMediaDocument(filename: string, mediaId: string): unknown {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'mediaSingle',
        attrs: { layout: 'center' },
        content: [
          {
            type: 'media',
            attrs: {
              alt: filename,
              id: mediaId,
              type: 'file',
            },
          },
        ],
      },
    ],
  };
}

describe('jira issue details', () => {
  test('builds issue detail and attachment thumbnail URLs safely', () => {
    expect(buildJiraIssueDetailUrl('cloud-123', 'OPS-123')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123?fields=summary%2Cstatus%2Cpriority%2Cupdated%2Cdescription%2Ccomment%2Cattachment%2Cissuelinks&expand=renderedFields'
    );
    expect(buildJiraAttachmentThumbnailUrl('cloud-123', '10001')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/thumbnail/10001'
    );
    expect(buildJiraAttachmentContentUrl('cloud-123', '10001')).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/content/10001'
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
          bodyAdf: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Latest review note.' }] }],
          },
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
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/OPS-123?fields=summary%2Cstatus%2Cpriority%2Cupdated%2Cdescription%2Ccomment%2Cattachment%2Cissuelinks&expand=renderedFields',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer sample-access-value',
        },
      }
    );
  });

  test('extracts ordered inline attachment IDs from rendered Jira description HTML', async () => {
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            key: 'OPS-123',
            renderedFields: {
              description:
                '<p>Before</p><span class="image-wrap"><img src="/rest/api/3/attachment/content/10002" /></span><p><img src="/secure/thumbnail/10003/_thumb_10003.png" /></p>',
            },
            fields: {
              summary: 'Stabilize payment reconciliation alerts',
              status: {
                name: 'In Progress',
                statusCategory: { name: 'In Progress' },
              },
              priority: null,
              updated: '2026-05-01T08:20:00.000+0000',
              description: {
                type: 'doc',
                version: 1,
                content: [],
              },
              comment: { comments: [] },
              attachment: [
                {
                  id: '10002',
                  filename: 'inline-first.png',
                  mimeType: 'image/png',
                  size: 100,
                },
                {
                  id: '10003',
                  filename: 'inline-second.png',
                  mimeType: 'image/png',
                  size: 100,
                },
              ],
              issuelinks: [],
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

    expect(result.descriptionMediaAttachmentIds).toEqual(['10002', '10003']);
  });

  test('fetches image attachment content as a bounded data URI', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/content/10001',
      {
        headers: {
          Accept: '*/*',
          Authorization: 'Bearer sample-access-value',
        },
        redirect: 'manual',
      }
    );
  });

  test('falls back to bounded attachment thumbnail when content is not image binary', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/content/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ self: 'https://example.invalid/content' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'Content-Length': '3',
            'Content-Type': 'image/png',
          },
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
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/content/10001',
      {
        headers: {
          Accept: '*/*',
          Authorization: 'Bearer sample-access-value',
        },
        redirect: 'manual',
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/attachment/thumbnail/10001',
      {
        headers: {
          Accept: '*/*',
          Authorization: 'Bearer sample-access-value',
        },
        redirect: 'manual',
      }
    );
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

  test('does not read oversized attachment bodies when content length exceeds the byte limit', async () => {
    const oversizedFetch = vi.fn(() => {
      return Promise.resolve(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: {
            'Content-Length': '4',
            'Content-Type': 'image/png',
          },
        })
      );
    });

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
      '<figure class="jira-adf-media jira-adf-media-single" data-layout="center"><img src="data:image/png;base64,AQID" alt="preview.png" width="640" height="360" loading="lazy" data-lightbox="true" /></figure>'
    );
    expect(result.attachments[0]?.imageDataUri).toBe('data:image/png;base64,AQID');
  });

  test('hydrates inline media in Jira comments from image attachments', async () => {
    const commentAdf = createMediaDocument('comment-preview.png', 'comment-media-id');
    const detail = createHydrationDetail({
      comments: [
        {
          id: 'comment-1',
          authorDisplayName: 'Current User',
          bodyText: '',
          bodyHtml:
            '<figure class="jira-adf-media jira-adf-media-single" data-layout="center"><span class="jira-adf-media-placeholder" role="img" aria-label="comment-preview.png">Image preview unavailable</span></figure>',
          bodyAdf: commentAdf,
          created: '2026-05-01T08:30:00.000+0000',
        },
      ],
      attachments: [
        {
          id: '10001',
          filename: 'comment-preview.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
      ],
    });
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

    expect(result.comments[0]?.bodyHtml).toContain(
      '<img src="data:image/png;base64,AQID" alt="comment-preview.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.comments[0]?.bodyHtml).not.toContain('Image preview unavailable');
  });

  test('hydrates Jira comment media outside rendered description attachment hints', async () => {
    const detail = createHydrationDetail({
      descriptionAdf: createMediaDocument('description-preview.png', 'description-media-id'),
      descriptionMediaAttachmentIds: ['10001'],
      comments: [
        {
          id: 'comment-1',
          authorDisplayName: 'Current User',
          bodyText: '',
          bodyHtml:
            '<figure class="jira-adf-media jira-adf-media-single" data-layout="center"><span class="jira-adf-media-placeholder" role="img" aria-label="comment-preview.png">Image preview unavailable</span></figure>',
          bodyAdf: createMediaDocument('comment-preview.png', 'comment-media-id'),
          created: '2026-05-01T08:30:00.000+0000',
        },
      ],
      attachments: [
        {
          id: '10001',
          filename: 'description-preview.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
        {
          id: '10002',
          filename: 'comment-preview.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
      ],
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const bytes = url.includes('/10002') ? new Uint8Array([2]) : new Uint8Array([1]);
      return Promise.resolve(
        new Response(bytes, {
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
      '<img src="data:image/png;base64,AQ==" alt="description-preview.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.comments[0]?.bodyHtml).toContain(
      '<img src="data:image/png;base64,Ag==" alt="comment-preview.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.comments[0]?.bodyHtml).not.toContain('Image preview unavailable');
  });

  test('prioritizes Jira comment media filenames while hydrating attachments', async () => {
    const attachments = Array.from({ length: 7 }, (_, index) => {
      const attachmentNumber = index + 1;
      return {
        id: `1000${String(attachmentNumber)}`,
        filename: attachmentNumber === 7 ? 'comment-target.png' : `unrelated-${String(attachmentNumber)}.png`,
        mimeType: 'image/png',
        size: 100,
        imageDataUri: null,
      };
    });
    const detail = createHydrationDetail({
      comments: [
        {
          id: 'comment-1',
          authorDisplayName: 'Current User',
          bodyText: '',
          bodyHtml:
            '<figure class="jira-adf-media jira-adf-media-single" data-layout="center"><span class="jira-adf-media-placeholder" role="img" aria-label="comment-target.png">Image preview unavailable</span></figure>',
          bodyAdf: createMediaDocument('comment-target.png', 'comment-media-id'),
          created: '2026-05-01T08:30:00.000+0000',
        },
      ],
      attachments,
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const bytes = url.includes('/10007') ? new Uint8Array([7]) : new Uint8Array([1]);
      return Promise.resolve(
        new Response(bytes, {
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

    expect(result.comments[0]?.bodyHtml).toContain(
      '<img src="data:image/png;base64,Bw==" alt="comment-target.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.comments[0]?.bodyHtml).not.toContain('Image preview unavailable');
    expect(result.attachments[0]?.imageDataUri).toBeNull();
    expect(result.attachments[6]?.imageDataUri).toBe('data:image/png;base64,Bw==');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstFetchInput = fetchMock.mock.calls[0]?.[0];
    if (typeof firstFetchInput !== 'string') {
      throw new Error('Expected the first attachment image request to use a string URL.');
    }
    expect(firstFetchInput).toContain('/10007');
  });

  test('hydrates inline media by image attachment order when Jira media IDs differ from attachment IDs', async () => {
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
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: '4478e39c-cf9b-41d1-ba92-68589487cd75',
                  type: 'file',
                },
              },
            ],
          },
          {
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: '5be450d6-f635-45f2-905b-714d71765c6a',
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      descriptionText: '',
      descriptionHtml: '',
      comments: [],
      attachments: [
        {
          id: '10001',
          filename: 'first-preview.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
        {
          id: '10002',
          filename: 'second-preview.png',
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
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const bytes = url.includes('/10002') ? new Uint8Array([2]) : new Uint8Array([1]);
      return Promise.resolve(
        new Response(bytes, {
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
      '<img src="data:image/png;base64,AQ==" alt="first-preview.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.descriptionHtml).toContain(
      '<img src="data:image/png;base64,Ag==" alt="second-preview.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.descriptionHtml).not.toContain('Image preview unavailable');
  });

  test('hydrates inline media by matching Jira media IDs from attachment redirects', async () => {
    const mediaId = '4478e39c-cf9b-41d1-ba92-68589487cd75';
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
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: mediaId,
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      descriptionText: '',
      descriptionHtml: '',
      comments: [],
      attachments: [
        {
          id: '10001',
          filename: 'inline-diagram.png',
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
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/attachment/content/10001')) {
        expect(init?.headers).toEqual({
          Accept: '*/*',
          Authorization: 'Bearer sample-access-value',
        });
        return Promise.resolve(
          new Response(null, {
            status: 303,
            headers: {
              Location: `https://api.media.atlassian.com/file/${mediaId}/binary?token=redacted`,
            },
          })
        );
      }

      if (url.includes('/file/')) {
        expect(init?.headers).toEqual({ Accept: 'image/*' });
        return Promise.resolve(
          new Response(new Uint8Array([2]), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          })
        );
      }

      return Promise.resolve(new Response('not found', { status: 404 }));
    });
    const logs: string[] = [];

    const result = await hydrateIssueAttachmentImages(detail, {
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      fetchImpl: fetchMock,
      log: (message) => logs.push(message),
    });

    expect(result.descriptionHtml).toContain(
      '<img src="data:image/png;base64,Ag==" alt="inline-diagram.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.descriptionHtml).not.toContain('Image preview unavailable');
    expect(result.attachments[0]?.mediaId).toBe(mediaId);
    expect(logs).toEqual([
      'Requesting Jira attachment content image data.',
      'Jira attachment content image request returned HTTP 303.',
      'Following signed Atlassian media redirect for Jira attachment content.',
      'Signed Atlassian media request for Jira attachment content returned HTTP 200.',
    ]);
    expect(logs.join('\n')).not.toContain(mediaId);
    expect(logs.join('\n')).not.toContain('sample-access-value');
    expect(logs.join('\n')).not.toContain('token=redacted');
  });

  test('hydrates inline media from generic Jira media binary responses', async () => {
    const mediaId = '4478e39c-cf9b-41d1-ba92-68589487cd75';
    const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: mediaId,
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      descriptionText: '',
      descriptionHtml: '',
      comments: [],
      attachments: [
        {
          id: '10001',
          filename: 'inline-diagram.png',
          mimeType: 'application/octet-stream',
          size: 100,
          imageDataUri: null,
        },
      ],
      linkedCloneIssues: [],
      activityHtml: '',
      technicalNotesHtml: '',
      transitions: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/attachment/content/10001')) {
        expect(init?.headers).toEqual({
          Accept: '*/*',
          Authorization: 'Bearer sample-access-value',
        });
        return Promise.resolve(
          new Response(null, {
            status: 303,
            headers: {
              Location: `https://api.media.atlassian.com/file/${mediaId}/binary?token=redacted`,
            },
          })
        );
      }

      if (url.includes('/file/')) {
        expect(init?.headers).toEqual({ Accept: 'image/*' });
        return Promise.resolve(
          new Response(pngSignature, {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
          })
        );
      }

      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    const result = await hydrateIssueAttachmentImages(detail, {
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      fetchImpl: fetchMock,
    });

    expect(result.descriptionHtml).toContain(
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="inline-diagram.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.descriptionHtml).not.toContain('Image preview unavailable');
    expect(result.attachments[0]?.mediaId).toBe(mediaId);
  });

  test('hydrates inline media by prioritizing ADF media filenames before unrelated attachments', async () => {
    const attachments = Array.from({ length: 7 }, (_, index) => {
      const attachmentNumber = index + 1;
      return {
        id: `1000${String(attachmentNumber)}`,
        filename: attachmentNumber === 7 ? 'inline-target.png' : `unrelated-${String(attachmentNumber)}.png`,
        mimeType: 'image/png',
        size: 100,
        imageDataUri: null,
      };
    });
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
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  alt: 'inline-target.png',
                  collection: 'jira-10000-field-description',
                  id: 'unmapped-media-id',
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      descriptionText: '',
      descriptionHtml: '',
      comments: [],
      attachments,
      linkedCloneIssues: [],
      activityHtml: '',
      technicalNotesHtml: '',
      transitions: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const bytes = url.includes('/10007') ? new Uint8Array([7]) : new Uint8Array([1]);
      return Promise.resolve(
        new Response(bytes, {
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

    expect(result.descriptionHtml).toContain(
      '<img src="data:image/png;base64,Bw==" alt="inline-target.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.descriptionHtml).not.toContain('Image preview unavailable');
    expect(result.attachments[0]?.imageDataUri).toBeNull();
    expect(result.attachments[6]?.imageDataUri).toBe('data:image/png;base64,Bw==');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstFetchInput = fetchMock.mock.calls[0]?.[0];
    if (typeof firstFetchInput !== 'string') {
      throw new Error('Expected the first attachment image request to use a string URL.');
    }
    expect(firstFetchInput).toContain('/10007');
  });

  test('hydrates rendered description media before unrelated image attachments', async () => {
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
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: '4478e39c-cf9b-41d1-ba92-68589487cd75',
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      descriptionMediaAttachmentIds: ['10002'],
      descriptionText: '',
      descriptionHtml: '',
      comments: [],
      attachments: [
        {
          id: '10001',
          filename: 'unrelated-dashboard.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
        {
          id: '10002',
          filename: 'inline-diagram.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
        {
          id: '10003',
          filename: 'unrelated-trace.png',
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
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const bytes = url.includes('/10002') ? new Uint8Array([2]) : new Uint8Array([1]);
      return Promise.resolve(
        new Response(bytes, {
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

    expect(result.descriptionHtml).toContain(
      '<img src="data:image/png;base64,Ag==" alt="inline-diagram.png" loading="lazy" data-lightbox="true" />'
    );
    expect(result.descriptionHtml).not.toContain('Image preview unavailable');
    expect(result.attachments[0]?.imageDataUri).toBeNull();
    expect(result.attachments[1]?.imageDataUri).toBe('data:image/png;base64,Ag==');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('keeps rendered description media unavailable when its hinted attachment cannot hydrate', async () => {
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
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: {
                  collection: 'jira-10000-field-description',
                  id: '4478e39c-cf9b-41d1-ba92-68589487cd75',
                  type: 'file',
                },
              },
            ],
          },
        ],
      },
      descriptionMediaAttachmentIds: ['10002'],
      descriptionText: '',
      descriptionHtml: '',
      comments: [],
      attachments: [
        {
          id: '10001',
          filename: 'unrelated-dashboard.png',
          mimeType: 'image/png',
          size: 100,
          imageDataUri: null,
        },
        {
          id: '10002',
          filename: 'inline-diagram.png',
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
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/10002')) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }

      return Promise.resolve(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      );
    });

    const result = await hydrateIssueAttachmentImages(detail, {
      accessToken: 'sample-access-value',
      cloudId: 'cloud-123',
      maxImages: 2,
      fetchImpl: fetchMock,
    });

    expect(result.descriptionHtml).toContain('Image preview unavailable');
    expect(result.descriptionHtml).not.toContain('unrelated-dashboard.png');
    expect(result.attachments[0]?.imageDataUri).toBe('data:image/png;base64,AQ==');
    expect(result.attachments[1]?.imageDataUri).toBeNull();
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

  test('does not return a data URI when attachment image requests fail', async () => {
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
