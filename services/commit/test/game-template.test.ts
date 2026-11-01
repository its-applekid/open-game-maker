import { GameRepoTemplateSource } from '@ogm/game-repo-template';
import { describe, expect, it } from 'vitest';

import { createRepo } from '../src/ops/create-repo.js';
import { DefaultTemplateSource, withGameTemplates } from '../src/template-source.js';
import { contextWith, fakeRequest } from './helpers.js';

describe('create_repo with the game-repo template', () => {
  it('commits skill links as symlinks and creates the template labels and checks', async () => {
    let blobs = 0;
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/blobs')) return { sha: `blob-${(blobs += 1)}` };
      if (call.route.endsWith('/git/trees')) return { sha: 'tree-1' };
      if (call.route.endsWith('/git/commits')) return { sha: 'commit-1' };
      return {};
    });
    const templates = withGameTemplates(new GameRepoTemplateSource(), new DefaultTemplateSource());
    const result = await createRepo(
      { kind: 'create_repo', gameId: 'g1', owner: 'alice', visibility: 'private', templateRef: 'game-3d@1' },
      contextWith(request, { templates }),
    );
    expect(result).toEqual({ ok: true, sha: 'commit-1' });

    const tree = calls.find((call) => call.route.endsWith('/git/trees'))!.parameters.tree as {
      path: string;
      mode: string;
      sha: string;
    }[];
    const blobContent = (sha: string) => {
      const index = Number(sha.slice('blob-'.length)) - 1;
      const blob = calls.filter((call) => call.route.endsWith('/git/blobs'))[index]!;
      return Buffer.from(blob.parameters.content as string, 'base64').toString('utf8');
    };
    const link = tree.find((entry) => entry.path === '.codex/skills/gm-core')!;
    expect(link.mode).toBe('120000');
    expect(blobContent(link.sha)).toBe('../../.claude/skills/gm-core');
    expect(tree.find((entry) => entry.path === '.agents/skills/gm-core')!.mode).toBe('120000');
    expect(tree.find((entry) => entry.path === 'AGENTS.md')!.mode).toBe('100644');

    const labels = calls.filter((call) => call.route === 'POST /repos/{owner}/{repo}/labels');
    expect(labels.map((call) => call.parameters.name)).toContain('agent:human-review');
    const ruleset = calls.find((call) => call.route === 'POST /repos/{owner}/{repo}/rulesets')!;
    expect(JSON.stringify(ruleset.parameters)).toContain('"context":"ogm/boundary"');
  });

  it('keeps the built-in default ref', async () => {
    const templates = withGameTemplates(new GameRepoTemplateSource(), new DefaultTemplateSource());
    const rendered = await templates.render('default', { gameId: 'g1', owner: 'alice', visibility: 'private' });
    expect(rendered.files.map((file) => file.path)).toContain('README.md');
  });
});
