import { z } from 'zod';

export interface RemoteWebLink {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly relationship: string;
  readonly host: string;
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
