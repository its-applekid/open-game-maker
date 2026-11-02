import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function read(path: string): string {
  return readFileSync(`${ROOT}/${path}`, 'utf8');
}

describe('gm asset showcase workflow', () => {
  it('documents a pre-rendered, private-library showcase contract', () => {
    const skill = read('skills/gm-asset-showcase/SKILL.md');
    const router = read('skills/gm-core/SKILL.md');
    const docs = read('docs/reference/thumbnail-scenes.md');

    expect(router).toContain('| gm-asset-showcase |');
    expect(skill).toContain('H.264');
    expect(skill).toContain('faststart');
    expect(skill).toContain('GIF');
    expect(skill).toContain('poster');
    expect(skill).toMatch(/per[- ]region/i);
    expect(skill).toMatch(/per[- ]sheet/i);
    expect(skill).toMatch(/stable (actor )?id/i);
    expect(skill).toMatch(/action.*target.*timing/is);
    expect(skill).toMatch(/diamond seam/i);
    expect(skill).toMatch(/never.*(?:canvas|game engine|compositor)/is);
    expect(docs).toContain('## Set showcase contract');
    expect(docs).toMatch(/MP4.*GIF.*poster/is);
    expect(docs).toMatch(/pre-rendered media only/i);
  });
});
