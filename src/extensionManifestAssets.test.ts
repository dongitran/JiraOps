import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';
import { z } from 'zod';

const ManifestSchema = z.object({
  icon: z.string(),
  contributes: z.object({
    viewsContainers: z.object({
      activitybar: z.array(z.object({ icon: z.string() })).min(1),
    }),
  }),
});

describe('extension manifest assets', () => {
  test('uses a PNG Marketplace icon and a transparent Activity Bar SVG glyph', () => {
    const manifest = readManifest();
    const activityIcon = manifest.contributes.viewsContainers.activitybar[0]?.icon;

    expect(manifest.icon).toBe('resources/jira-ops.png');
    expect(activityIcon).toBe('resources/jira-ops.svg');
    expect(readProjectBuffer(manifest.icon).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );

    const activitySvg = readProjectFile(activityIcon ?? '');
    expect(activitySvg).toContain('viewBox="0 0 24 24"');
    expect(activitySvg).toContain('currentColor');
    expect(activitySvg).not.toMatch(/<rect\b/u);
    expect(activitySvg).not.toContain('#10161e');
  });

  test('scopes dashboard Details hover reveal to issue cards', () => {
    const css = readProjectFile('docs/designs/prototypes/assets/jira-ops.css');
    const hoverMediaStart = css.indexOf('@media (hover: hover)');
    const hoverMediaEnd = css.indexOf('.issue-meta-row', hoverMediaStart);
    const hoverMediaBlock = css.slice(hoverMediaStart, hoverMediaEnd);

    expect(hoverMediaStart).toBeGreaterThanOrEqual(0);
    expect(hoverMediaEnd).toBeGreaterThan(hoverMediaStart);
    expect(hoverMediaBlock).toContain('.issue-card .detail-button');
    expect(hoverMediaBlock).toContain('opacity: 0;');
    expect(hoverMediaBlock).toContain('pointer-events: none;');
    expect(hoverMediaBlock).toContain('transition: opacity 0.15s ease;');
    expect(hoverMediaBlock).toContain('.issue-card:hover .detail-button');
    expect(hoverMediaBlock).toContain('.issue-card:focus-within .detail-button');
    expect(hoverMediaBlock).toContain('opacity: 1;');
    expect(hoverMediaBlock).toContain('pointer-events: auto;');
    expect(hoverMediaBlock).not.toContain('.notification-detail-button');
  });
});

function readManifest(): z.infer<typeof ManifestSchema> {
  const parsed: unknown = JSON.parse(readProjectFile('package.json'));
  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('package.json does not match the expected extension manifest shape.');
  }
  return result.data;
}

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function readProjectBuffer(path: string): Buffer {
  return readFileSync(resolve(process.cwd(), path));
}
