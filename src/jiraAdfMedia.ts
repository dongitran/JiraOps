type AdfMediaNode = Record<string, unknown>;

export interface AdfMediaImage {
  readonly filename: string;
  readonly id: string;
  readonly imageDataUri: string;
  readonly mimeType: string;
}

export interface AdfMediaContext {
  readonly mediaImages: readonly AdfMediaImage[];
  readonly singleFallbackMediaImage: AdfMediaImage | null;
}

const MEDIA_LAYOUTS = new Set([
  'align-end',
  'align-start',
  'center',
  'full-width',
  'wide',
  'wrap-left',
  'wrap-right',
]);

export function countAdfMediaNodes(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }

  const currentCount = getString(value, 'type') === 'media' ? 1 : 0;
  const content = value['content'];
  if (!Array.isArray(content)) {
    return currentCount;
  }

  let total = currentCount;
  const children: readonly unknown[] = content;
  for (const child of children) {
    total += countAdfMediaNodes(child);
  }
  return total;
}

export function findSingleRenderableAdfMediaImage(
  images: readonly AdfMediaImage[]
): AdfMediaImage | null {
  const renderableImages = images.filter(isRenderableAdfMediaImage);
  return renderableImages.length === 1 ? renderableImages[0] ?? null : null;
}

export function resolveAdfMediaImage(
  attrs: AdfMediaNode | null,
  context: AdfMediaContext
): AdfMediaImage | null {
  return (
    findMediaImageById(context.mediaImages, getString(attrs, 'id')) ??
    findMediaImageByFilename(context.mediaImages, getString(attrs, 'alt')) ??
    context.singleFallbackMediaImage
  );
}

export function resolveAdfMediaAlt(
  attrs: AdfMediaNode | null,
  image: AdfMediaImage
): string {
  const alt = getString(attrs, 'alt').trim();
  return alt.length > 0 ? alt : image.filename;
}

export function resolveAdfMediaLabel(attrs: AdfMediaNode | null): string {
  const alt = getString(attrs, 'alt').trim();
  return alt.length > 0 ? alt : 'Jira image preview unavailable';
}

export function resolveAdfMediaLayout(attrs: AdfMediaNode | null): string {
  const layout = getString(attrs, 'layout');
  return MEDIA_LAYOUTS.has(layout) ? layout : 'center';
}

export function getPositiveAdfInteger(
  node: AdfMediaNode | null,
  key: string
): number | null {
  if (node === null) {
    return null;
  }

  const value = node[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function isAdfImageDataUri(value: string): boolean {
  return value.slice(0, 11).toLowerCase() === 'data:image/';
}

function findMediaImageById(
  images: readonly AdfMediaImage[],
  id: string
): AdfMediaImage | null {
  if (id.length === 0) {
    return null;
  }

  const found = images.find((image) => {
    return image.id === id && isRenderableAdfMediaImage(image);
  });
  return found ?? null;
}

function findMediaImageByFilename(
  images: readonly AdfMediaImage[],
  filename: string
): AdfMediaImage | null {
  const normalizedFilename = normalizeMediaFilename(filename);
  if (normalizedFilename.length === 0) {
    return null;
  }

  const found = images.find((image) => {
    return normalizeMediaFilename(image.filename) === normalizedFilename && isRenderableAdfMediaImage(image);
  });
  return found ?? null;
}

function isRenderableAdfMediaImage(image: AdfMediaImage): boolean {
  return image.mimeType.toLowerCase().startsWith('image/') && isAdfImageDataUri(image.imageDataUri);
}

function normalizeMediaFilename(value: string): string {
  return value.trim().toLowerCase();
}

function getString(node: AdfMediaNode | null, key: string): string {
  if (node === null) {
    return '';
  }

  const value = node[key];
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is AdfMediaNode {
  return typeof value === 'object' && value !== null;
}
