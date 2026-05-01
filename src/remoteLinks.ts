import { z } from 'zod';

export interface RemoteWebLink {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly relationship: string;
  readonly host: string;
}

export interface MergeRequestLink {
  readonly id: string;
  readonly sourceLinkId: string;
  readonly title: string;
  readonly url: string;
  readonly host: string;
  readonly projectPath: string;
  readonly iid: string;
}

const RemoteLinkObjectSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
});

const RemoteLinkSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  relationship: z.string().optional(),
  object: RemoteLinkObjectSchema.optional(),
});

const RemoteLinkArraySchema = z.array(RemoteLinkSchema);

export function parseRemoteLinksResponse(responseBody: unknown): RemoteWebLink[] {
  const parseResult = RemoteLinkArraySchema.safeParse(responseBody);
  if (!parseResult.success) {
    throw new Error('Jira remote link response was not an array.');
  }

  return parseResult.data
    .map((entry, index) => mapRemoteLink(entry, index))
    .filter((entry): entry is RemoteWebLink => entry !== null);
}

export function extractGitLabMergeRequests(
  links: readonly RemoteWebLink[]
): MergeRequestLink[] {
  return links
    .map((link) => mapMergeRequestLink(link))
    .filter((link): link is MergeRequestLink => link !== null);
}

function mapRemoteLink(
  entry: z.infer<typeof RemoteLinkSchema>,
  index: number
): RemoteWebLink | null {
  const rawUrl = entry.object?.url?.trim() ?? '';
  const parsedUrl = parseWebUrl(rawUrl);
  if (parsedUrl === null) {
    return null;
  }

  const title = entry.object?.title?.trim() ?? '';
  if (title.length === 0) {
    return null;
  }

  return {
    id: normalizeRemoteLinkId(entry.id, index),
    title,
    url: parsedUrl.toString(),
    relationship: normalizeRelationship(entry.relationship),
    host: parsedUrl.host,
  };
}

function mapMergeRequestLink(link: RemoteWebLink): MergeRequestLink | null {
  const parsedUrl = parseWebUrl(link.url);
  if (parsedUrl === null) {
    return null;
  }

  const match = parseMergeRequestPath(parsedUrl.pathname);
  if (match === null) {
    return null;
  }

  return {
    id: link.id,
    sourceLinkId: link.id,
    title: link.title,
    url: parsedUrl.toString(),
    host: parsedUrl.host,
    projectPath: match.projectPath,
    iid: match.iid,
  };
}

function parseMergeRequestPath(
  pathname: string
): { readonly projectPath: string; readonly iid: string } | null {
  const parts = pathname.split('/').filter((part) => part.length > 0);
  const separatorIndex = parts.indexOf('-');
  const mergeRequestLabel = parts[separatorIndex + 1];
  const iid = parts[separatorIndex + 2];
  if (separatorIndex < 1 || mergeRequestLabel !== 'merge_requests') {
    return null;
  }

  if (iid === undefined || !/^\d+$/.test(iid)) {
    return null;
  }

  return {
    projectPath: parts.slice(0, separatorIndex).map(decodePathSegment).join('/'),
    iid,
  };
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseWebUrl(rawUrl: string): URL | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return null;
  }

  return parsedUrl;
}

function normalizeRemoteLinkId(
  id: string | number | undefined,
  index: number
): string {
  if (typeof id === 'string' && id.trim().length > 0) {
    return id.trim();
  }

  if (typeof id === 'number' && Number.isFinite(id)) {
    return String(id);
  }

  return `remote-link-${String(index + 1)}`;
}

function normalizeRelationship(relationship: string | undefined): string {
  const normalized = relationship?.trim() ?? '';
  return normalized.length > 0 ? normalized : 'Web Link';
}
