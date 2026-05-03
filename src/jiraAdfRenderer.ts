type AdfNode = Record<string, unknown>;
type NodeRenderer = (node: AdfNode) => string;

export interface RenderedAdfHtmlSections {
  readonly activityHtml: string;
  readonly mainHtml: string;
  readonly technicalNotesHtml: string;
}

interface AdfMark {
  readonly type: string;
  readonly attrs: AdfNode | null;
}

interface ExtractedAdfSections {
  readonly activityContent: readonly unknown[];
  readonly mainContent: readonly unknown[];
  readonly technicalNotesContent: readonly unknown[];
}

interface ExtractableSectionMarker {
  readonly kind: 'activity' | 'technicalNotes';
  readonly level: number;
  readonly nodeType: 'heading' | 'paragraph';
}

const NODE_RENDERERS: Record<string, NodeRenderer> = {
  blockquote: renderBlockquote,
  bulletList: renderBulletList,
  codeBlock: renderCodeBlock,
  doc: renderChildren,
  emoji: renderEmoji,
  hardBreak: renderHardBreak,
  heading: renderHeading,
  inlineCard: renderInlineCard,
  listItem: renderListItem,
  mention: renderMention,
  orderedList: renderOrderedList,
  panel: renderChildren,
  paragraph: renderParagraph,
  rule: renderRule,
  table: renderTable,
  tableCell: renderTableCell,
  tableHeader: renderTableHeader,
  tableRow: renderTableRow,
  text: renderText,
};

export function renderAdfHtml(value: unknown): string {
  return renderNode(value);
}

export function renderAdfHtmlSections(value: unknown): RenderedAdfHtmlSections {
  const content = getTopLevelContent(value);
  if (content === null) {
    return {
      activityHtml: '',
      mainHtml: renderAdfHtml(value),
      technicalNotesHtml: '',
    };
  }

  const sections = splitExtractableSections(content);

  return {
    activityHtml: renderChildren({ content: sections.activityContent, type: 'doc' }),
    mainHtml: renderChildren({ content: sections.mainContent, type: 'doc' }),
    technicalNotesHtml: renderChildren({ content: sections.technicalNotesContent, type: 'doc' }),
  };
}

export function extractTextFromAdf(value: unknown): string {
  const parts: string[] = [];
  collectAdfText(value, parts);
  return normalizeExtractedText(parts.join(''));
}

function renderNode(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }

  const type = getString(value, 'type');
  const renderer = NODE_RENDERERS[type];
  return renderer === undefined ? renderChildren(value) : renderer(value);
}

function renderChildren(node: AdfNode): string {
  const content = node['content'];
  if (!Array.isArray(content)) {
    return '';
  }

  return content.map(renderNode).join('');
}

function renderParagraph(node: AdfNode): string {
  const content = renderChildren(node);
  return content.length === 0 ? '' : `<p>${content}</p>`;
}

function renderHeading(node: AdfNode): string {
  const level = resolveHeadingLevel(node);
  const content = renderChildren(node);
  return content.length === 0 ? '' : `<h${String(level)}>${content}</h${String(level)}>`;
}

function renderBulletList(node: AdfNode): string {
  return renderWrappedChildren('ul', node);
}

function renderOrderedList(node: AdfNode): string {
  return renderWrappedChildren('ol', node);
}

function renderListItem(node: AdfNode): string {
  return renderWrappedChildren('li', node);
}

function renderBlockquote(node: AdfNode): string {
  return renderWrappedChildren('blockquote', node);
}

function renderCodeBlock(node: AdfNode): string {
  const text = extractTextFromAdf({ type: 'doc', content: node['content'] });
  return text.length === 0 ? '' : `<pre><code>${escapeHtml(text)}</code></pre>`;
}

function renderRule(): string {
  return '<hr />';
}

function renderHardBreak(): string {
  return '<br />';
}

function renderTable(node: AdfNode): string {
  return renderWrappedChildren('table', node);
}

function renderTableRow(node: AdfNode): string {
  return renderWrappedChildren('tr', node);
}

function renderTableCell(node: AdfNode): string {
  return renderWrappedChildren('td', node);
}

function renderTableHeader(node: AdfNode): string {
  return renderWrappedChildren('th', node);
}

function renderMention(node: AdfNode): string {
  const attrs = getAttrs(node);
  const text = getString(attrs, 'text');
  return text.length === 0 ? '' : escapeHtml(text);
}

function renderEmoji(node: AdfNode): string {
  const attrs = getAttrs(node);
  const text = getString(attrs, 'text');
  return text.length === 0 ? '' : escapeHtml(text);
}

function renderInlineCard(node: AdfNode): string {
  const attrs = getAttrs(node);
  const url = resolveSafeHref(getString(attrs, 'url'));
  return url === null ? '' : `<a href="${escapeAttribute(url)}">${escapeHtml(url)}</a>`;
}

function renderText(node: AdfNode): string {
  const text = escapeHtml(getString(node, 'text'));
  return applyMarks(text, getMarks(node));
}

function renderWrappedChildren(tag: string, node: AdfNode): string {
  const content = renderChildren(node);
  return content.length === 0 ? '' : `<${tag}>${content}</${tag}>`;
}

function getTopLevelContent(value: unknown): readonly unknown[] | null {
  if (!isRecord(value) || getString(value, 'type') !== 'doc') {
    return null;
  }

  const content = value['content'];
  return Array.isArray(content) ? content : null;
}

function splitExtractableSections(content: readonly unknown[]): ExtractedAdfSections {
  const consumedIndexes = new Set<number>();
  const activityContent: unknown[] = [];
  const technicalNotesContent: unknown[] = [];
  let index = 0;
  while (index < content.length) {
    const marker = resolveExtractableSectionMarker(content[index]);
    if (marker === null) {
      index += 1;
      continue;
    }

    const end = findExtractableSectionEnd(content, index, marker);
    appendSectionContent(marker.kind, content.slice(index + 1, end), {
      activityContent,
      technicalNotesContent,
    });
    markConsumedIndexes(consumedIndexes, index, end);
    index = end;
  }

  return {
    activityContent,
    mainContent: content.filter((_, contentIndex) => !consumedIndexes.has(contentIndex)),
    technicalNotesContent,
  };
}

function appendSectionContent(
  kind: ExtractableSectionMarker['kind'],
  content: readonly unknown[],
  sections: {
    readonly activityContent: unknown[];
    readonly technicalNotesContent: unknown[];
  }
): void {
  if (kind === 'activity') {
    sections.activityContent.push(...content);
    return;
  }

  sections.technicalNotesContent.push(...content);
}

function markConsumedIndexes(indexes: Set<number>, start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    indexes.add(index);
  }
}

function findExtractableSectionEnd(
  content: readonly unknown[],
  startIndex: number,
  marker: ExtractableSectionMarker
): number {
  for (let index = startIndex + 1; index < content.length; index += 1) {
    if (resolveExtractableSectionMarker(content[index]) !== null) {
      return index;
    }

    if (isSectionBoundary(content[index], marker)) {
      return index;
    }
  }
  return content.length;
}

function isSectionBoundary(value: unknown, marker: ExtractableSectionMarker): boolean {
  if (!isHeading(value)) {
    return false;
  }

  return marker.nodeType === 'paragraph' || headingLevel(value) <= marker.level;
}

function resolveExtractableSectionMarker(
  value: unknown
): ExtractableSectionMarker | null {
  if (isHeading(value)) {
    const kind = resolveSectionKind(value);
    return kind === null
      ? null
      : {
          kind,
          level: headingLevel(value),
          nodeType: 'heading',
        };
  }

  if (!isParagraph(value)) {
    return null;
  }

  const kind = resolveSectionKind(value);
  return kind === null ? null : { kind, level: 3, nodeType: 'paragraph' };
}

function resolveSectionKind(value: unknown): ExtractableSectionMarker['kind'] | null {
  const text = normalizeHeadingText(extractTextFromAdf(value));
  if (text === 'activity') {
    return 'activity';
  }

  if (text === 'technical note' || text === 'technical notes') {
    return 'technicalNotes';
  }

  return null;
}

function isHeading(value: unknown): value is AdfNode {
  return isRecord(value) && getString(value, 'type') === 'heading';
}

function isParagraph(value: unknown): value is AdfNode {
  return isRecord(value) && getString(value, 'type') === 'paragraph';
}

function headingLevel(value: unknown): number {
  return isRecord(value) ? resolveHeadingLevel(value) : 3;
}

function normalizeHeadingText(value: string): string {
  return value
    .trim()
    .replace(/[:：]+$/u, '')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

function applyMarks(initialHtml: string, marks: readonly AdfMark[]): string {
  return marks.reduce((html, mark) => {
    return applyMark(html, mark);
  }, initialHtml);
}

function applyMark(html: string, mark: AdfMark): string {
  if (mark.type === 'strong') {
    return `<strong>${html}</strong>`;
  }
  if (mark.type === 'em') {
    return `<em>${html}</em>`;
  }
  if (mark.type === 'code') {
    return `<code>${html}</code>`;
  }
  if (mark.type === 'strike') {
    return `<s>${html}</s>`;
  }
  if (mark.type === 'underline') {
    return `<u>${html}</u>`;
  }
  if (mark.type === 'link') {
    return renderLinkMark(html, mark.attrs);
  }
  return html;
}

function renderLinkMark(html: string, attrs: AdfNode | null): string {
  const href = resolveSafeHref(getString(attrs, 'href'));
  return href === null ? html : `<a href="${escapeAttribute(href)}">${html}</a>`;
}

function getMarks(node: AdfNode): AdfMark[] {
  const marks = node['marks'];
  if (!Array.isArray(marks)) {
    return [];
  }

  return marks.flatMap((mark) => {
    if (!isRecord(mark)) {
      return [];
    }

    const type = getString(mark, 'type');
    return type.length === 0 ? [] : [{ type, attrs: getAttrs(mark) }];
  });
}

function getAttrs(node: AdfNode | null): AdfNode | null {
  if (node === null) {
    return null;
  }

  const attrs = node['attrs'];
  return isRecord(attrs) ? attrs : null;
}

function resolveHeadingLevel(node: AdfNode): number {
  const attrs = getAttrs(node);
  const rawLevel = attrs?.['level'];
  return typeof rawLevel === 'number' && Number.isInteger(rawLevel)
    ? Math.min(Math.max(rawLevel, 1), 6)
    : 3;
}

function resolveSafeHref(value: string): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    return null;
  }

  return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
    ? parsedUrl.toString()
    : null;
}

function collectAdfText(value: unknown, parts: string[]): void {
  if (!isRecord(value)) {
    return;
  }

  const type = getString(value, 'type');
  if (type === 'text') {
    parts.push(getString(value, 'text'));
  }
  if (type === 'hardBreak') {
    parts.push('\n');
  }

  collectAdfChildren(value['content'], parts);
  if (isAdfBlockNode(type)) {
    parts.push('\n');
  }
}

function collectAdfChildren(value: unknown, parts: string[]): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const child of value) {
    collectAdfText(child, parts);
  }
}

function isAdfBlockNode(type: string): boolean {
  return [
    'blockquote',
    'codeBlock',
    'heading',
    'listItem',
    'mediaSingle',
    'paragraph',
  ].includes(type);
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n[ \t]+/gu, '\n')
    .replace(/\n{2,}/gu, '\n')
    .trim();
}

function getString(node: AdfNode | null, key: string): string {
  if (node === null) {
    return '';
  }

  const value = node[key];
  return typeof value === 'string' ? value : '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function isRecord(value: unknown): value is AdfNode {
  return typeof value === 'object' && value !== null;
}
