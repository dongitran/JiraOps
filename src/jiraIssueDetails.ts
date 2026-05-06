import { Buffer } from 'node:buffer';

import { z } from 'zod';

import { isAdfImageDataUri } from './jiraAdfMedia';
import {
  extractTextFromAdf,
  renderAdfHtml,
  renderAdfHtmlSections,
  type AdfMediaImage,
} from './jiraAdfRenderer';

export { extractTextFromAdf } from './jiraAdfRenderer';

export interface FetchJiraIssueDetailOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly issueKey: string;
  readonly fetchImpl?: typeof fetch;
}

export interface FetchJiraAttachmentImageDataUriOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly attachmentId: string;
  readonly maxBytes?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface HydrateIssueAttachmentImagesOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly maxImages?: number;
  readonly maxBytes?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface JiraIssueComment {
  readonly id: string;
  readonly authorDisplayName: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
  readonly created: string;
}

export interface JiraIssueAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly imageDataUri: string | null;
}

export interface JiraLinkedCloneIssue {
  readonly key: string;
  readonly relationship: string;
  readonly status: string | null;
}

export interface JiraIssueDetail {
  readonly activityHtml: string;
  readonly key: string;
  readonly summary: string;
  readonly status: string;
  readonly statusCategory: string;
  readonly priority: string | null;
  readonly updated: string;
  readonly descriptionAdf?: unknown;
  readonly descriptionText: string;
  readonly descriptionHtml: string;
  readonly technicalNotesHtml: string;
  readonly comments: readonly JiraIssueComment[];
  readonly attachments: readonly JiraIssueAttachment[];
  readonly linkedCloneIssues: readonly JiraLinkedCloneIssue[];
  readonly transitions: readonly JiraIssueTransition[];
}

export interface JiraIssueTransition {
  readonly id: string;
  readonly name: string;
  readonly toStatus: string;
}

const ATLASSIAN_API_ROOT = 'https://api.atlassian.com/ex/jira';
const ISSUE_DETAIL_FIELDS = [
  'summary',
  'status',
  'priority',
  'updated',
  'description',
  'comment',
  'attachment',
  'issuelinks',
] as const;
const DEFAULT_ATTACHMENT_IMAGE_MAX_BYTES = 1_500_000;
const DEFAULT_ATTACHMENT_IMAGE_LIMIT = 6;

const LinkedIssueSchema = z.object({
  key: z.string().min(1),
  fields: z
    .object({
      status: z
        .object({
          name: z.string().min(1),
        })
        .optional(),
    })
    .optional(),
});

const IssueLinkSchema = z.object({
  type: z
    .object({
      name: z.string().optional(),
      inward: z.string().optional(),
      outward: z.string().optional(),
    })
    .optional(),
  inwardIssue: LinkedIssueSchema.optional(),
  outwardIssue: LinkedIssueSchema.optional(),
});

const CommentSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  author: z
    .object({
      displayName: z.string().optional(),
    })
    .optional(),
  body: z.unknown().optional().nullable(),
  created: z.string().optional(),
});

const AttachmentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().nonnegative().optional(),
});

const JiraIssueDetailResponseSchema = z.object({
  key: z.string().min(1),
  fields: z.object({
    summary: z.string().min(1),
    status: z.object({
      name: z.string().min(1),
      statusCategory: z.object({
        name: z.string().min(1),
      }),
    }),
    priority: z
      .object({
        name: z.string().min(1),
      })
      .nullable()
      .optional(),
    updated: z.string().min(1),
    description: z.unknown().optional().nullable(),
    comment: z.union([z.array(CommentSchema), z.object({ comments: z.array(CommentSchema) })]).optional(),
    attachment: z.array(AttachmentSchema).optional(),
    issuelinks: z.array(IssueLinkSchema).optional(),
  }),
});

export function buildJiraIssueDetailUrl(cloudId: string, issueKey: string): string {
  const encodedCloudId = encodeURIComponent(cloudId);
  const encodedIssueKey = encodeURIComponent(issueKey);
  const fields = encodeURIComponent(ISSUE_DETAIL_FIELDS.join(','));
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/issue/${encodedIssueKey}?fields=${fields}`;
}

export function buildJiraAttachmentThumbnailUrl(
  cloudId: string,
  attachmentId: string
): string {
  const encodedCloudId = encodeURIComponent(cloudId);
  const encodedAttachmentId = encodeURIComponent(attachmentId);
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/attachment/thumbnail/${encodedAttachmentId}?redirect=false`;
}

export async function fetchJiraIssueDetail(
  options: FetchJiraIssueDetailOptions
): Promise<JiraIssueDetail> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildJiraIssueDetailUrl(options.cloudId, options.issueKey),
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Jira issue detail could not be loaded.');
  }

  const responseBody: unknown = await response.json();
  return parseJiraIssueDetail(responseBody);
}

export async function fetchJiraAttachmentImageDataUri(
  options: FetchJiraAttachmentImageDataUriOptions
): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildJiraAttachmentThumbnailUrl(options.cloudId, options.attachmentId),
    {
      headers: {
        Accept: 'image/*',
        Authorization: `Bearer ${options.accessToken}`,
      },
    }
  );

  return response.ok ? responseToImageDataUri(response, options.maxBytes) : null;
}

export async function hydrateIssueAttachmentImages(
  detail: JiraIssueDetail,
  options: HydrateIssueAttachmentImagesOptions
): Promise<JiraIssueDetail> {
  let remainingImages = options.maxImages ?? DEFAULT_ATTACHMENT_IMAGE_LIMIT;
  const attachments: JiraIssueAttachment[] = [];

  for (const attachment of detail.attachments) {
    const imageDataUri =
      remainingImages > 0 && isImageAttachment(attachment)
        ? await fetchImageDataUriForAttachment(attachment, options)
        : attachment.imageDataUri;
    if (imageDataUri !== null) {
      remainingImages -= 1;
    }
    attachments.push({ ...attachment, imageDataUri });
  }

  return renderIssueDescriptionWithHydratedMedia({ ...detail, attachments });
}

export function countInlineIssueDescriptionImages(detail: JiraIssueDetail): number {
  return (
    countInlineImageMarkup(detail.descriptionHtml) +
    countInlineImageMarkup(detail.activityHtml) +
    countInlineImageMarkup(detail.technicalNotesHtml)
  );
}

export function countUnavailableInlineIssueDescriptionImages(
  detail: JiraIssueDetail
): number {
  return (
    countInlinePlaceholderMarkup(detail.descriptionHtml) +
    countInlinePlaceholderMarkup(detail.activityHtml) +
    countInlinePlaceholderMarkup(detail.technicalNotesHtml)
  );
}

function parseJiraIssueDetail(responseBody: unknown): JiraIssueDetail {
  const parseResult = JiraIssueDetailResponseSchema.safeParse(responseBody);
  if (!parseResult.success) {
    throw new Error('Jira issue detail response was not valid.');
  }

  const fields = parseResult.data.fields;
  const descriptionSections = renderAdfHtmlSections(fields.description);
  return {
    key: parseResult.data.key,
    activityHtml: descriptionSections.activityHtml,
    summary: fields.summary,
    status: fields.status.name,
    statusCategory: fields.status.statusCategory.name,
    priority: fields.priority?.name ?? null,
    updated: fields.updated,
    descriptionAdf: fields.description ?? null,
    descriptionText: extractTextFromAdf(fields.description),
    descriptionHtml: descriptionSections.mainHtml,
    technicalNotesHtml: descriptionSections.technicalNotesHtml,
    comments: mapComments(fields.comment),
    attachments: mapAttachments(fields.attachment ?? []),
    linkedCloneIssues: mapCloneIssueLinks(fields.issuelinks ?? []),
    transitions: [],
  };
}

function renderIssueDescriptionWithHydratedMedia(
  detail: JiraIssueDetail
): JiraIssueDetail {
  if (!('descriptionAdf' in detail)) {
    return detail;
  }

  const mediaImages = toAdfMediaImages(detail.attachments);
  const descriptionSections = renderAdfHtmlSections(detail.descriptionAdf, {
    mediaImages,
  });
  return {
    ...detail,
    activityHtml: descriptionSections.activityHtml,
    descriptionHtml: descriptionSections.mainHtml,
    technicalNotesHtml: descriptionSections.technicalNotesHtml,
  };
}

function toAdfMediaImages(
  attachments: readonly JiraIssueAttachment[]
): AdfMediaImage[] {
  return attachments.flatMap((attachment) => {
    if (attachment.imageDataUri === null || !isImageAttachment(attachment)) {
      return [];
    }

    if (!isAdfImageDataUri(attachment.imageDataUri)) {
      return [];
    }

    return [
      {
        filename: attachment.filename,
        id: attachment.id,
        imageDataUri: attachment.imageDataUri,
        mimeType: attachment.mimeType,
      },
    ];
  });
}

function countInlineImageMarkup(value: string): number {
  return value.match(/<img\s[^>]*src="data:image\//gu)?.length ?? 0;
}

function countInlinePlaceholderMarkup(value: string): number {
  return value.match(/jira-adf-media-placeholder/gu)?.length ?? 0;
}

function mapComments(commentField: z.infer<typeof JiraIssueDetailResponseSchema>['fields']['comment']): JiraIssueComment[] {
  const comments = Array.isArray(commentField) ? commentField : commentField?.comments ?? [];
  return comments.map((comment, index) => {
    return {
      id: normalizeId(comment.id, index, 'comment'),
      authorDisplayName: comment.author?.displayName ?? 'Unknown author',
      bodyText: extractTextFromAdf(comment.body),
      bodyHtml: renderAdfHtml(comment.body),
      created: comment.created ?? '',
    };
  });
}

function mapAttachments(
  attachments: readonly z.infer<typeof AttachmentSchema>[]
): JiraIssueAttachment[] {
  return attachments.map((attachment) => {
    return {
      id: normalizeId(attachment.id, 0, 'attachment'),
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size ?? 0,
      imageDataUri: null,
    };
  });
}

function mapCloneIssueLinks(
  issueLinks: readonly z.infer<typeof IssueLinkSchema>[]
): JiraLinkedCloneIssue[] {
  const cloneIssues = new Map<string, JiraLinkedCloneIssue>();
  for (const issueLink of issueLinks) {
    const cloneIssue = mapCloneIssueLink(issueLink);
    if (cloneIssue !== null) {
      cloneIssues.set(`${cloneIssue.key}:${cloneIssue.relationship}`, cloneIssue);
    }
  }
  return [...cloneIssues.values()];
}

function mapCloneIssueLink(
  issueLink: z.infer<typeof IssueLinkSchema>
): JiraLinkedCloneIssue | null {
  if (!isCloneLinkType(issueLink.type)) {
    return null;
  }

  const outwardRelationship = issueLink.type?.outward ?? 'clones';
  if (issueLink.outwardIssue !== undefined) {
    return isClonesRelationship(outwardRelationship)
      ? mapLinkedIssue(issueLink.outwardIssue, outwardRelationship)
      : null;
  }

  const inwardRelationship = issueLink.type?.inward ?? 'is cloned by';
  if (issueLink.inwardIssue !== undefined) {
    return isClonesRelationship(inwardRelationship)
      ? mapLinkedIssue(issueLink.inwardIssue, inwardRelationship)
      : null;
  }

  return null;
}

function mapLinkedIssue(
  issue: z.infer<typeof LinkedIssueSchema>,
  relationship: string
): JiraLinkedCloneIssue {
  return {
    key: issue.key,
    relationship,
    status: issue.fields?.status?.name ?? null,
  };
}

function isCloneLinkType(
  type: z.infer<typeof IssueLinkSchema>['type']
): boolean {
  return [type?.name, type?.inward, type?.outward].some((label) => {
    return typeof label === 'string' && label.toLowerCase().includes('clone');
  });
}

function isClonesRelationship(relationship: string): boolean {
  return relationship.trim().toLowerCase() === 'clones';
}

async function responseToImageDataUri(
  response: Response,
  maxBytes = DEFAULT_ATTACHMENT_IMAGE_MAX_BYTES
): Promise<string | null> {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!contentType.startsWith('image/')) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    return null;
  }

  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

async function fetchImageDataUriForAttachment(
  attachment: JiraIssueAttachment,
  options: HydrateIssueAttachmentImagesOptions
): Promise<string | null> {
  const requestOptions: FetchJiraAttachmentImageDataUriOptions = {
    accessToken: options.accessToken,
    cloudId: options.cloudId,
    attachmentId: attachment.id,
  };
  const withMaxBytes =
    options.maxBytes === undefined
      ? requestOptions
      : { ...requestOptions, maxBytes: options.maxBytes };
  const withFetch =
    options.fetchImpl === undefined ? withMaxBytes : { ...withMaxBytes, fetchImpl: options.fetchImpl };
  return fetchJiraAttachmentImageDataUri(withFetch);
}

function isImageAttachment(attachment: JiraIssueAttachment): boolean {
  return attachment.mimeType.toLowerCase().startsWith('image/');
}

function normalizeId(id: string | number | undefined, index: number, prefix: string): string {
  if (typeof id === 'string' && id.trim().length > 0) {
    return id.trim();
  }

  if (typeof id === 'number' && Number.isFinite(id)) {
    return String(id);
  }

  return `${prefix}-${String(index + 1)}`;
}
