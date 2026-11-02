import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';

import { loadIndex } from '@ogm/asset-cards';
import type { BoundaryVerdict } from '@ogm/contracts';

import { EXIT, type GmCommand } from '../../command.js';
import { repoVisibility, requireAssetsRoot } from '../../context.js';
import { readLock } from '../../lock.js';
import { entrySource, resolveEntry } from '../../resolve.js';
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
    /* `gm build assets` resolves files itself so a missing one fails only that asset; it passes `skipFiles`. */
    const checkFiles = flags.skipFiles !== true;
    const refusals: Refusal[] = [];
    for (const entry of lock.assets) {
      const card = byId.get(entry.id);
      if (checkFiles) {
        const resolution = await resolveEntry(entry, {
          cwd: ctx.cwd,
          assetsRoot: ctx.assetsRoot,
          blobRoot: ctx.blobRoot,
          collections: index.collections,
        });
        if (!resolution.ok) {
          refusals.push({
            code: 'rights',
            rule: resolution.rule,
            id: entry.id,
            path: entry.path,
            detail: `${resolution.detail}. Try: ${resolution.fix}`,
          });
        }
      }
      refusals.push(
        ...refusalsForCheck(
          entry,
          card,
          /* The file rules ran above against the entry's source; only the rights rules apply here. */
          { exists: true, sha256: entry.sha256 },
          {
            publish,
            visibility: currentVisibility,
            ...(card ? { currentRights: rightsForCard(card, index.collections) } : {}),
          },
        ).map((item) => ({ ...item, path: entry.path })),
      );
    }
    const lockedPaths = new Set<string>();
    for (const entry of lock.assets.filter((candidate) => entrySource(candidate) === 'vendored')) {
      lockedPaths.add(entry.path);
      for (const file of entry.files ?? []) lockedPaths.add(file.path);
      if (entry.files !== undefined) continue;
      /* Older locks did not list companions; they sit beside the primary under their library basename. */
      for (const source of byId.get(entry.id)?.source?.files ?? []) {
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
