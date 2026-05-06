import { Buffer } from 'node:buffer';

export interface FetchJiraAttachmentImageDataUriOptions {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly attachmentId: string;
  readonly maxBytes?: number;
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

    const imageDataUri = await responseToImageDataUri(response, options.maxBytes);
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

    const imageDataUri = await responseToImageDataUri(response, options.maxBytes);
    return imageDataUri === null
      ? null
      : { imageDataUri, mediaId: extractMediaIdFromUrl(url) };
  } catch {
    return null;
  }
}

async function responseToImageDataUri(
  response: Response,
  maxBytes = DEFAULT_ATTACHMENT_IMAGE_MAX_BYTES
): Promise<string | null> {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!contentType.startsWith('image/')) {
    return null;
  }

  if (isResponseLargerThan(response, maxBytes)) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
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
