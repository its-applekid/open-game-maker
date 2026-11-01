import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';

import { loadIndex } from '@ogm/asset-cards';
import type { BoundaryVerdict } from '@ogm/contracts';

import { EXIT, type GmCommand } from '../../command.js';
import { repoVisibility, requireAssetsRoot } from '../../context.js';
import { readLock, sha256File } from '../../lock.js';
import { refusalsForCheck, rightsForCard, type Refusal } from '../../rules.js';

async function assetFiles(cwd: string): Promise<string[]> {
  const root = join(cwd, 'assets');
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(cwd, join(entry.parentPath, entry.name)).replaceAll(sep, '/'))
    .sort();
}

function printRefusals(ctx: Parameters<GmCommand['run']>[0], refusals: Refusal[], json: boolean): void {
  const reasons: BoundaryVerdict['reasons'] = refusals.map((item) => ({
    code: 'rights',
    path: item.path,
    detail: `${item.id} ${item.rule} ${item.detail}`,
  }));
  if (json) ctx.out(JSON.stringify({ allowed: reasons.length === 0, reasons } satisfies BoundaryVerdict));
  else for (const item of refusals) ctx.err(`${item.id}  ${item.rule}  ${item.detail}`);
}

export const command: GmCommand = {
  name: 'check assets',
  summary: 'verify asset files, lock integrity, and publish rights',
  usage: '[--publish] [--repo-visibility public|private] [--json]',
  example: 'check assets --publish --repo-visibility public',
  flags: {
    publish: { type: 'boolean', default: false, help: 'apply publish-time rights rules' },
    'repo-visibility': { type: 'string', help: 'public or private repository visibility' },
  },
  async run(ctx, _args, flags) {
    const files = await assetFiles(ctx.cwd);
    let lock;
    try {
      lock = await readLock(ctx.cwd);
    } catch (error) {
      const refusals: Refusal[] = [
        {
          code: 'rights',
          rule: 'stale-rights',
          id: 'assets.lock.json',
          detail: error instanceof Error ? error.message : String(error),
        },
      ];
      printRefusals(ctx, refusals, ctx.json);
      ctx.emit('assets.check', { publish: flags.publish === true, violations: refusals.length });
      return EXIT.failed;
    }
    if (lock === null) {
      const refusals = files.map<Refusal>((path) => ({
        code: 'rights',
        rule: 'unknown-id',
        id: path,
        path,
        detail: 'file is not represented in assets.lock.json',
      }));
      if (refusals.length === 0 && !ctx.json) ctx.out('no assets');
      printRefusals(ctx, refusals, ctx.json);
      ctx.emit('assets.check', { publish: flags.publish === true, violations: refusals.length });
      return refusals.length === 0 ? EXIT.ok : EXIT.failed;
    }

    const index = lock.assets.some((entry) => !entry.id.startsWith('t3:'))
      ? await loadIndex(requireAssetsRoot(ctx))
      : { cards: [], collections: {} };
    const byId = new Map(index.cards.map((card) => [card.id, card]));
    const publish = flags.publish === true;
    const currentVisibility = await repoVisibility(ctx.cwd, flags['repo-visibility']);
    const refusals: Refusal[] = [];
    for (const entry of lock.assets) {
      const absolute = join(ctx.cwd, entry.path);
      const exists = existsSync(absolute);
      const card = byId.get(entry.id);
      refusals.push(
        ...refusalsForCheck(
          entry,
          card,
          { exists, ...(exists ? { sha256: await sha256File(absolute) } : {}) },
          {
            publish,
            visibility: currentVisibility,
            ...(card ? { currentRights: rightsForCard(card, index.collections) } : {}),
          },
        ).map((item) => ({ ...item, path: entry.path })),
      );
    }
    const lockedPaths = new Set(lock.assets.map((entry) => entry.path));
    for (const entry of lock.assets) {
      const card = byId.get(entry.id);
      for (const source of card?.source?.files ?? []) {
        if (source.role === 'texture' || source.role === 'companion') {
          lockedPaths.add(join(dirname(entry.path), basename(source.path)).replaceAll(sep, '/'));
        }
      }
    }
    for (const path of files.filter((file) => !lockedPaths.has(file))) {
      refusals.push({
        code: 'rights',
        rule: 'unknown-id',
        id: path,
        path,
        detail: 'file is not represented in assets.lock.json',
      });
    }
    printRefusals(ctx, refusals, ctx.json);
    ctx.emit('assets.check', { publish, violations: refusals.length });
    return refusals.length === 0 ? EXIT.ok : EXIT.failed;
  },
};
