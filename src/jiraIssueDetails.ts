import { z } from 'zod';

import {
  fetchJiraAttachmentImageData,
  type FetchJiraAttachmentImageDataUriOptions,
  type JiraAttachmentImageData,
} from './jiraAttachmentImages';
import { isAdfImageDataUri } from './jiraAdfMedia';
import {
  extractTextFromAdf,
  renderAdfHtml,
  renderAdfHtmlSections,
  type AdfMediaImage,
} from './jiraAdfRenderer';

export { extractTextFromAdf } from './jiraAdfRenderer';
export {
  buildJiraAttachmentContentUrl,
  buildJiraAttachmentThumbnailUrl,
  fetchJiraAttachmentImageDataUri,
  type FetchJiraAttachmentImageDataUriOptions,
} from './jiraAttachmentImages';

export interface FetchJiraIssueDetailOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly issueKey: string;
  readonly fetchImpl?: typeof fetch;
}

export interface HydrateIssueAttachmentImagesOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly maxImages?: number;
  readonly maxBytes?: number;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (message: string) => void;
}

export interface JiraIssueComment {
  readonly id: string;
  readonly authorDisplayName: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
  readonly bodyAdf?: unknown;
  readonly created: string;
}

export interface JiraIssueAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly imageDataUri: string | null;
  readonly mediaId?: string;
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
  readonly descriptionMediaAttachmentIds?: readonly string[];
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
const DEFAULT_ATTACHMENT_IMAGE_LIMIT = 6;
const IMAGE_TAG_PATTERN = /<img\b[^>]*>/giu;
const DATA_ATTACHMENT_ID_PATTERN =
  /\bdata-(?:attachment-id|linked-resource-id)=["']?(\d+)/iu;
const ATTACHMENT_URL_ID_PATTERN =
  /\/(?:rest\/api\/[23]\/attachment\/(?:content|thumbnail)|secure\/(?:attachment|thumbnail))\/(\d+)(?=[/?#"' >]|$)/iu;

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
  renderedFields: z
    .object({
      description: z.string().nullable().optional(),
    })
    .optional(),
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
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/issue/${encodedIssueKey}?fields=${fields}&expand=renderedFields`;
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

export async function hydrateIssueAttachmentImages(
  detail: JiraIssueDetail,
  options: HydrateIssueAttachmentImagesOptions
): Promise<JiraIssueDetail> {
  let remainingImages = options.maxImages ?? DEFAULT_ATTACHMENT_IMAGE_LIMIT;
  const imageDataByAttachmentId = new Map<string, JiraAttachmentImageData | null>();
  const hydrationQueue = orderAttachmentsForHydration(
    detail.attachments,
    detail.descriptionMediaAttachmentIds ?? [],
    collectIssueMediaFilenames(detail)
  );

  for (const attachment of hydrationQueue) {
    const fetchedImageData =
      remainingImages > 0 && isLikelyImageAttachment(attachment)
        ? await fetchImageDataForAttachment(attachment, options)
        : null;
    const imageData = fetchedImageData ?? toExistingAttachmentImageData(attachment);
    if (imageData !== null) {
      remainingImages -= 1;
    }
    imageDataByAttachmentId.set(attachment.id, imageData);
  }

  const attachments = detail.attachments.map((attachment) => {
    return imageDataByAttachmentId.has(attachment.id)
      ? withAttachmentImageData(attachment, imageDataByAttachmentId.get(attachment.id) ?? null)
      : attachment;
  });

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

export function countInlineIssueCommentImages(detail: JiraIssueDetail): number {
  return detail.comments.reduce((count, comment) => {
    return count + countInlineImageMarkup(comment.bodyHtml);
  }, 0);
}

export function countUnavailableInlineIssueCommentImages(detail: JiraIssueDetail): number {
  return detail.comments.reduce((count, comment) => {
    return count + countInlinePlaceholderMarkup(comment.bodyHtml);
  }, 0);
}

export function countRenderedInlineIssueDescriptionImageHints(
  detail: JiraIssueDetail
): number {
  return detail.descriptionMediaAttachmentIds?.length ?? 0;
}

export function countIssueDescriptionAdfMediaNodes(detail: JiraIssueDetail): number {
  return countAdfMediaNodes(detail.descriptionAdf);
}

export function countIssueImageAttachments(detail: JiraIssueDetail): number {
  return detail.attachments.filter(isLikelyImageAttachment).length;
}

export function countHydratedIssueAttachmentImages(detail: JiraIssueDetail): number {
  return detail.attachments.filter((attachment) => {
    return attachment.imageDataUri !== null && isAdfImageDataUri(attachment.imageDataUri);
  }).length;
}

export function countCapturedIssueAttachmentMediaIds(detail: JiraIssueDetail): number {
  return detail.attachments.filter((attachment) => {
    return typeof attachment.mediaId === 'string' && attachment.mediaId.length > 0;
  }).length;
}

function parseJiraIssueDetail(responseBody: unknown): JiraIssueDetail {
  const parseResult = JiraIssueDetailResponseSchema.safeParse(responseBody);
  if (!parseResult.success) {
    throw new Error('Jira issue detail response was not valid.');
  }

  const fields = parseResult.data.fields;
  const descriptionSections = renderAdfHtmlSections(fields.description);
  const mediaAttachmentIds = extractRenderedDescriptionImageAttachmentIds(
    parseResult.data.renderedFields?.description ?? ''
  );
  const detail = {
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
  return mediaAttachmentIds.length === 0
    ? detail
    : { ...detail, descriptionMediaAttachmentIds: mediaAttachmentIds };
}

function renderIssueDescriptionWithHydratedMedia(detail: JiraIssueDetail): JiraIssueDetail {
  const inlineAttachmentIds = detail.descriptionMediaAttachmentIds ?? [];
  const descriptionMediaImages =
    inlineAttachmentIds.length === 0
      ? toAdfMediaImages(detail.attachments)
      : toOrderedAdfMediaImages(detail.attachments, inlineAttachmentIds);
  const commentMediaImages = toAdfMediaImages(detail.attachments);
  const descriptionSections =
    'descriptionAdf' in detail
      ? renderAdfHtmlSections(detail.descriptionAdf, { mediaImages: descriptionMediaImages })
      : null;
  const withHydratedComments = {
    ...detail,
    comments: detail.comments.map((comment) =>
      renderCommentWithHydratedMedia(comment, commentMediaImages)
    ),
  };
  return descriptionSections === null
    ? withHydratedComments
    : {
        ...withHydratedComments,
        activityHtml: descriptionSections.activityHtml,
        descriptionHtml: descriptionSections.mainHtml,
        technicalNotesHtml: descriptionSections.technicalNotesHtml,
      };
}

function orderAttachmentsForHydration(
  attachments: readonly JiraIssueAttachment[],
  preferredAttachmentIds: readonly string[],
  preferredFilenames: readonly string[]
): JiraIssueAttachment[] {
  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const queuedIds = new Set<string>();
  const queue: JiraIssueAttachment[] = [];
  for (const attachmentId of preferredAttachmentIds) {
    const attachment = attachmentsById.get(attachmentId);
    if (attachment !== undefined && !queuedIds.has(attachment.id)) {
      queue.push(attachment);
      queuedIds.add(attachment.id);
    }
  }

  const preferredFilenameSet = new Set(preferredFilenames.map(normalizeFilename));
  for (const attachment of attachments) {
    if (preferredFilenameSet.has(normalizeFilename(attachment.filename)) && !queuedIds.has(attachment.id)) {
      queue.push(attachment);
      queuedIds.add(attachment.id);
    }
  }

  for (const attachment of attachments) {
    if (!queuedIds.has(attachment.id)) {
      queue.push(attachment);
      queuedIds.add(attachment.id);
    }
  }
  return queue;
}

function toAdfMediaImages(
  attachments: readonly JiraIssueAttachment[]
): AdfMediaImage[] {
  return attachments.flatMap((attachment) => {
    const mediaImage = toAdfMediaImage(attachment);
    return mediaImage === null ? [] : [mediaImage];
  });
}

function toOrderedAdfMediaImages(
  attachments: readonly JiraIssueAttachment[],
  attachmentIds: readonly string[]
): AdfMediaImage[] {
  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  return attachmentIds.flatMap((attachmentId, mediaNodeIndex) => {
    const attachment = attachmentsById.get(attachmentId);
    if (attachment === undefined) {
      return [];
    }

    const mediaImage = toAdfMediaImage(attachment, mediaNodeIndex);
    return mediaImage === null ? [] : [mediaImage];
  });
}

function toAdfMediaImage(
  attachment: JiraIssueAttachment,
  mediaNodeIndex?: number
): AdfMediaImage | null {
  if (attachment.imageDataUri === null) {
    return null;
  }

  if (!isAdfImageDataUri(attachment.imageDataUri)) {
    return null;
  }

  const mediaImage = {
    filename: attachment.filename,
    id: attachment.id,
    imageDataUri: attachment.imageDataUri,
    mimeType: attachment.mimeType,
  };
  const withMediaId =
    attachment.mediaId === undefined ? mediaImage : { ...mediaImage, mediaId: attachment.mediaId };
  return mediaNodeIndex === undefined ? withMediaId : { ...withMediaId, mediaNodeIndex };
}

function countAdfMediaNodes(value: unknown): number {
  if (!isUnknownRecord(value)) {
    return 0;
  }

  const current = value['type'] === 'media' ? 1 : 0;
  const content = value['content'];
  if (!Array.isArray(content)) {
    return current;
  }

  return content.reduce((total: number, child: unknown) => {
    return total + countAdfMediaNodes(child);
  }, current);
}

function collectIssueMediaFilenames(detail: JiraIssueDetail): string[] {
  const filenames = collectAdfMediaFilenames(detail.descriptionAdf);
  for (const comment of detail.comments) {
    if (comment.bodyAdf !== undefined) {
      filenames.push(...collectAdfMediaFilenames(comment.bodyAdf));
    }
  }
  return filenames;
}

function collectAdfMediaFilenames(value: unknown): string[] {
  if (!isUnknownRecord(value)) {
    return [];
  }

  const attrs = isUnknownRecord(value['attrs']) ? value['attrs'] : null;
  const current =
    value['type'] === 'media' && typeof attrs?.['alt'] === 'string'
      ? [attrs['alt']]
      : [];
  const content = value['content'];
  if (!Array.isArray(content)) {
    return current;
  }

  return content.reduce<string[]>((filenames, child: unknown) => {
    filenames.push(...collectAdfMediaFilenames(child));
    return filenames;
  }, current);
}

function renderCommentWithHydratedMedia(
  comment: JiraIssueComment,
  mediaImages: readonly AdfMediaImage[]
): JiraIssueComment {
  if (comment.bodyAdf === undefined) {
    return comment;
  }
  return {
    ...comment,
    bodyHtml: renderAdfHtml(comment.bodyAdf, { mediaImages }),
  };
}

function countInlineImageMarkup(value: string): number {
  return value.match(/<img\s[^>]*src="data:image\//gu)?.length ?? 0;
}

function countInlinePlaceholderMarkup(value: string): number {
  return value.match(/jira-adf-media-placeholder/gu)?.length ?? 0;
}

function extractRenderedDescriptionImageAttachmentIds(value: string): string[] {
  const attachmentIds: string[] = [];
  for (const match of value.matchAll(IMAGE_TAG_PATTERN)) {
    const attachmentId = extractAttachmentIdFromHtml(match[0]);
    if (attachmentId !== null) {
      attachmentIds.push(attachmentId);
    }
  }
  return attachmentIds;
}

function extractAttachmentIdFromHtml(value: string): string | null {
  const dataMatch = DATA_ATTACHMENT_ID_PATTERN.exec(value);
  if (dataMatch?.[1] !== undefined) {
    return dataMatch[1];
  }

  const urlMatch = ATTACHMENT_URL_ID_PATTERN.exec(value);
  return urlMatch?.[1] ?? null;
}

function mapComments(commentField: z.infer<typeof JiraIssueDetailResponseSchema>['fields']['comment']): JiraIssueComment[] {
  const comments = Array.isArray(commentField) ? commentField : commentField?.comments ?? [];
  return comments.map((comment, index) => {
    const mappedComment = {
      id: normalizeId(comment.id, index, 'comment'),
      authorDisplayName: comment.author?.displayName ?? 'Unknown author',
      bodyText: extractTextFromAdf(comment.body),
      bodyHtml: renderAdfHtml(comment.body),
      created: comment.created ?? '',
    };
    return comment.body === undefined ? mappedComment : { ...mappedComment, bodyAdf: comment.body };
  });
}

function mapAttachments(attachments: readonly z.infer<typeof AttachmentSchema>[]): JiraIssueAttachment[] {
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

async function fetchImageDataForAttachment(
  attachment: JiraIssueAttachment,
  options: HydrateIssueAttachmentImagesOptions
): Promise<JiraAttachmentImageData | null> {
  const requestOptions: FetchJiraAttachmentImageDataUriOptions = {
    accessToken: options.accessToken,
    cloudId: options.cloudId,
    attachmentId: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
  };
  const withMaxBytes =
    options.maxBytes === undefined
      ? requestOptions
      : { ...requestOptions, maxBytes: options.maxBytes };
  const withLog =
    options.log === undefined ? withMaxBytes : { ...withMaxBytes, log: options.log };
  const withFetch =
    options.fetchImpl === undefined ? withLog : { ...withLog, fetchImpl: options.fetchImpl };
  return fetchJiraAttachmentImageData(withFetch);
}

function toExistingAttachmentImageData(
  attachment: JiraIssueAttachment
): JiraAttachmentImageData | null {
  return attachment.imageDataUri === null
    ? null
    : { imageDataUri: attachment.imageDataUri, mediaId: attachment.mediaId ?? null };
}

function withAttachmentImageData(
  attachment: JiraIssueAttachment,
  imageData: JiraAttachmentImageData | null
): JiraIssueAttachment {
  const mediaId = imageData?.mediaId ?? attachment.mediaId;
  const withImageData = { ...attachment, imageDataUri: imageData?.imageDataUri ?? null };
  return mediaId === undefined ? withImageData : { ...withImageData, mediaId };
}

function isImageAttachment(attachment: JiraIssueAttachment): boolean {
  return attachment.mimeType.toLowerCase().startsWith('image/');
}

function isLikelyImageAttachment(attachment: JiraIssueAttachment): boolean {
  return isImageAttachment(attachment) || imageContentTypeFromFilename(attachment.filename) !== null;
}

function imageContentTypeFromFilename(filename: string): string | null {
  const normalizedFilename = normalizeFilename(filename);
  if (normalizedFilename.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedFilename.endsWith('.jpg') || normalizedFilename.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (normalizedFilename.endsWith('.gif')) {
    return 'image/gif';
  }

  if (normalizedFilename.endsWith('.webp')) {
    return 'image/webp';
  }

  return null;
}

function normalizeFilename(value: string): string {
  return value.trim().toLowerCase();
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

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
