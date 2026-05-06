type AdfMediaNode = Record<string, unknown>;

export interface AdfMediaImage {
  readonly filename: string;
  readonly id: string;
  readonly imageDataUri: string;
  readonly mediaNodeIndex?: number;
  readonly mimeType: string;
}

export interface AdfMediaContext {
  readonly mediaAssignments: readonly (AdfMediaImage | null)[];
  readonly mediaNodeIndexes: WeakMap<AdfMediaNode, number>;
}

interface AdfMediaReference {
  readonly filename: string;
  readonly id: string;
  readonly node: AdfMediaNode;
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

export function createAdfMediaContext(
  value: unknown,
  mediaImages: readonly AdfMediaImage[]
): AdfMediaContext {
  const renderableImages = mediaImages.filter(isRenderableAdfMediaImage);
  const references = collectAdfMediaReferences(value);
  return {
    mediaAssignments: resolveMediaAssignments(references, renderableImages),
    mediaNodeIndexes: createMediaNodeIndexes(references),
  };
}

export function resolveAdfMediaImage(
  node: AdfMediaNode,
  context: AdfMediaContext
): AdfMediaImage | null {
  const mediaIndex = context.mediaNodeIndexes.get(node);
  return mediaIndex === undefined ? null : context.mediaAssignments[mediaIndex] ?? null;
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

function collectAdfMediaReferences(value: unknown): AdfMediaReference[] {
  if (!isRecord(value)) {
    return [];
  }

  const current =
    getString(value, 'type') === 'media' ? [toAdfMediaReference(value)] : [];
  const content = value['content'];
  if (!Array.isArray(content)) {
    return current;
  }

  const children: readonly unknown[] = content;
  return children.reduce<AdfMediaReference[]>((references, child) => {
    references.push(...collectAdfMediaReferences(child));
    return references;
  }, current);
}

function toAdfMediaReference(node: AdfMediaNode): AdfMediaReference {
  const attrs = getAttrs(node);
  return {
    filename: getString(attrs, 'alt'),
    id: getString(attrs, 'id'),
    node,
  };
}

function createMediaNodeIndexes(
  references: readonly AdfMediaReference[]
): WeakMap<AdfMediaNode, number> {
  const indexes = new WeakMap<AdfMediaNode, number>();
  references.forEach((reference, index) => {
    indexes.set(reference.node, index);
  });
  return indexes;
}

function resolveMediaAssignments(
  references: readonly AdfMediaReference[],
  images: readonly AdfMediaImage[]
): (AdfMediaImage | null)[] {
  const usedImageIndexes = new Set<number>();
  const assignments = references.map((reference, mediaNodeIndex) => {
    const imageIndex = findExactImageIndex(
      images,
      reference,
      mediaNodeIndex,
      usedImageIndexes
    );
    if (imageIndex === null) {
      return null;
    }

    usedImageIndexes.add(imageIndex);
    return images[imageIndex] ?? null;
  });
  assignUnmatchedImagesByOrder(assignments, images, usedImageIndexes);
  return assignments;
}

function assignUnmatchedImagesByOrder(
  assignments: (AdfMediaImage | null)[],
  images: readonly AdfMediaImage[],
  usedImageIndexes: ReadonlySet<number>
): void {
  const unresolvedIndexes = collectUnresolvedIndexes(assignments);
  const unusedImages = images.filter((_, index) => !usedImageIndexes.has(index));
  if (unresolvedIndexes.length !== unusedImages.length) {
    return;
  }

  unresolvedIndexes.forEach((assignmentIndex, imageIndex) => {
    assignments[assignmentIndex] = unusedImages[imageIndex] ?? null;
  });
}

function collectUnresolvedIndexes(
  assignments: readonly (AdfMediaImage | null)[]
): number[] {
  return assignments.flatMap((assignment, index) => {
    return assignment === null ? [index] : [];
  });
}

function findExactImageIndex(
  images: readonly AdfMediaImage[],
  reference: AdfMediaReference,
  mediaNodeIndex: number,
  usedImageIndexes: ReadonlySet<number>
): number | null {
  const orderedMatch = findImageIndexByMediaNodeIndex(
    images,
    mediaNodeIndex,
    usedImageIndexes
  );
  if (orderedMatch !== null) {
    return orderedMatch;
  }

  const idMatch = findImageIndexById(images, reference.id, usedImageIndexes);
  return idMatch ?? findImageIndexByFilename(images, reference.filename, usedImageIndexes);
}

function findImageIndexByMediaNodeIndex(
  images: readonly AdfMediaImage[],
  mediaNodeIndex: number,
  usedImageIndexes: ReadonlySet<number>
): number | null {
  const foundIndex = images.findIndex((image, imageIndex) => {
    return image.mediaNodeIndex === mediaNodeIndex && !usedImageIndexes.has(imageIndex);
  });
  return foundIndex < 0 ? null : foundIndex;
}

function findImageIndexById(
  images: readonly AdfMediaImage[],
  id: string,
  usedImageIndexes: ReadonlySet<number>
): number | null {
  if (id.length === 0) {
    return null;
  }

  const foundIndex = images.findIndex((image, index) => {
    return image.id === id && !usedImageIndexes.has(index);
  });
  return foundIndex < 0 ? null : foundIndex;
}

function findImageIndexByFilename(
  images: readonly AdfMediaImage[],
  filename: string,
  usedImageIndexes: ReadonlySet<number>
): number | null {
  const normalizedFilename = normalizeMediaFilename(filename);
  if (normalizedFilename.length === 0) {
    return null;
  }

  const foundIndex = images.findIndex((image, index) => {
    return normalizeMediaFilename(image.filename) === normalizedFilename && !usedImageIndexes.has(index);
  });
  return foundIndex < 0 ? null : foundIndex;
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

function getAttrs(node: AdfMediaNode): AdfMediaNode | null {
  const attrs = node['attrs'];
  return isRecord(attrs) ? attrs : null;
}

function isRecord(value: unknown): value is AdfMediaNode {
  return typeof value === 'object' && value !== null;
}
