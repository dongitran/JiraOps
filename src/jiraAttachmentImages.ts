import { Buffer } from 'node:buffer';

export interface FetchJiraAttachmentImageDataUriOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly attachmentId: string;
  readonly filename?: string;
  readonly maxBytes?: number;
  readonly mimeType?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface JiraAttachmentImageData {
  readonly imageDataUri: string;
  readonly mediaId: string | null;
}

const ATLASSIAN_API_ROOT = 'https://api.atlassian.com/ex/jira';
const DEFAULT_ATTACHMENT_IMAGE_MAX_BYTES = 1_500_000;
const MEDIA_FILE_ID_PATTERN =
  /\/file\/([0-9a-fA-F-]{36})(?=\/|[?#]|$)/u;

export function buildJiraAttachmentThumbnailUrl(
  cloudId: string,
  attachmentId: string
): string {
  const encodedCloudId = encodeURIComponent(cloudId);
  const encodedAttachmentId = encodeURIComponent(attachmentId);
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/attachment/thumbnail/${encodedAttachmentId}`;
}

export function buildJiraAttachmentContentUrl(
  cloudId: string,
  attachmentId: string
): string {
  const encodedCloudId = encodeURIComponent(cloudId);
  const encodedAttachmentId = encodeURIComponent(attachmentId);
  return `${ATLASSIAN_API_ROOT}/${encodedCloudId}/rest/api/3/attachment/content/${encodedAttachmentId}`;
}

export async function fetchJiraAttachmentImageDataUri(
  options: FetchJiraAttachmentImageDataUriOptions
): Promise<string | null> {
  const imageData = await fetchJiraAttachmentImageData(options);
  return imageData?.imageDataUri ?? null;
}

export async function fetchJiraAttachmentImageData(
  options: FetchJiraAttachmentImageDataUriOptions
): Promise<JiraAttachmentImageData | null> {
  const thumbnailData = await fetchImageDataFromJiraEndpoint(
    buildJiraAttachmentThumbnailUrl(options.cloudId, options.attachmentId),
    options
  );
  return thumbnailData ?? await fetchImageDataFromJiraEndpoint(
    buildJiraAttachmentContentUrl(options.cloudId, options.attachmentId),
    options
  );
}

async function fetchImageDataFromJiraEndpoint(
  url: string,
  options: FetchJiraAttachmentImageDataUriOptions
): Promise<JiraAttachmentImageData | null> {
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(url, jiraImageRequestOptions(options.accessToken));
    if (isRedirectResponse(response)) {
      const redirectUrl = toAbsoluteRedirectUrl(response.headers.get('location'), url);
      return redirectUrl === null ? null : await fetchRedirectedImageData(redirectUrl, options);
    }

    if (!response.ok) {
      return null;
    }

    const imageDataUri = await responseToImageDataUri(response, options);
    return imageDataUri === null
      ? null
      : { imageDataUri, mediaId: extractMediaIdFromUrl(response.url) };
  } catch {
    return null;
  }
}

async function fetchRedirectedImageData(
  url: string,
  options: FetchJiraAttachmentImageDataUriOptions
): Promise<JiraAttachmentImageData | null> {
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(url, signedImageRequestOptions());
    if (!response.ok) {
      return null;
    }

    const imageDataUri = await responseToImageDataUri(response, options);
    return imageDataUri === null
      ? null
      : { imageDataUri, mediaId: extractMediaIdFromUrl(url) };
  } catch {
    return null;
  }
}

async function responseToImageDataUri(
  response: Response,
  options: FetchJiraAttachmentImageDataUriOptions
): Promise<string | null> {
  const maxBytes = options.maxBytes ?? DEFAULT_ATTACHMENT_IMAGE_MAX_BYTES;
  const headerContentType = normalizeContentType(response.headers.get('content-type'));

  if (isResponseLargerThan(response, maxBytes)) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    return null;
  }

  const contentType = resolveImageContentType({
    buffer,
    filename: options.filename,
    headerContentType,
    mimeType: options.mimeType,
  });
  if (contentType === null) {
    return null;
  }

  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function jiraImageRequestOptions(accessToken: string): RequestInit {
  return {
    headers: {
      Accept: 'image/*',
      Authorization: `Bearer ${accessToken}`,
    },
    redirect: 'manual',
  };
}

function signedImageRequestOptions(): RequestInit {
  return {
    headers: {
      Accept: 'image/*',
    },
  };
}

function isRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function isResponseLargerThan(response: Response, maxBytes: number): boolean {
  const contentLength = response.headers.get('content-length');
  if (contentLength === null) {
    return false;
  }

  const byteLength = Number.parseInt(contentLength, 10);
  return Number.isFinite(byteLength) && byteLength > maxBytes;
}

function extractMediaIdFromUrl(value: string): string | null {
  return MEDIA_FILE_ID_PATTERN.exec(value)?.[1] ?? null;
}

function resolveImageContentType(options: {
  readonly buffer: ArrayBuffer;
  readonly filename: string | undefined;
  readonly headerContentType: string;
  readonly mimeType: string | undefined;
}): string | null {
  if (isImageContentType(options.headerContentType)) {
    return options.headerContentType;
  }

  const sniffedContentType = sniffImageContentType(options.buffer);
  if (sniffedContentType !== null) {
    return sniffedContentType;
  }

  const declaredContentType = normalizeContentType(options.mimeType);
  if (isImageContentType(declaredContentType)) {
    return declaredContentType;
  }

  return imageContentTypeFromFilename(options.filename);
}

function sniffImageContentType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (startsWithAscii(bytes, 'GIF87a') || startsWithAscii(bytes, 'GIF89a')) {
    return 'image/gif';
  }

  return startsWithAscii(bytes, 'RIFF') && asciiAt(bytes, 8, 4) === 'WEBP'
    ? 'image/webp'
    : null;
}

function imageContentTypeFromFilename(filename: string | undefined): string | null {
  const normalizedFilename = filename?.trim().toLowerCase() ?? '';
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

function isImageContentType(value: string): boolean {
  return value.startsWith('image/');
}

function normalizeContentType(value: string | null | undefined): string {
  return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function startsWithAscii(bytes: Uint8Array, value: string): boolean {
  return asciiAt(bytes, 0, value.length) === value;
}

function asciiAt(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function toAbsoluteRedirectUrl(location: string | null, baseUrl: string): string | null {
  if (location === null || location.trim().length === 0) {
    return null;
  }

  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return null;
  }
}
