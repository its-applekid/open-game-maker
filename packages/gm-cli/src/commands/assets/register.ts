import { createHash } from 'node:crypto';
import { lstat, readFile, unlink } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { loadIndex } from '@ogm/asset-cards';
import type { LockEntry } from '@ogm/contracts';

import { putBlob } from '../../blobs.js';
import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { requireAssetsRoot, resolveContainedPath } from '../../context.js';
import { renderCredits } from '../../credits.js';
import { readLock, upsertLock, writeGeneratedText, writeLock } from '../../lock.js';
import { intersectLockRights, rightsForCard } from '../../rules.js';
import { MIME } from '../packs/index.js';

function repeated(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string' ? [value] : [];
}

async function safeRelativePath(cwd: string, input: string): Promise<{ absolute: string; relative: string }> {
  const absolute = resolve(cwd, input);
  const root = resolve(cwd);
  if (isAbsolute(input) || (absolute !== root && !absolute.startsWith(`${root}${sep}`))) {
    throw new UsageError(
      'registered path must be relative and inside the game repo',
      'gm assets register <path> --made-by-agent',
    );
  }
  const local = relative(root, absolute).replaceAll(sep, '/');
  if (local.split('/').some((part) => part === '..' || part === '.gm' || part === 'node_modules')) {
    throw new UsageError(
      'registered path cannot be under .gm or node_modules',
      'gm assets register <path> --made-by-agent',
    );
  }
  try {
    if ((await lstat(absolute)).isSymbolicLink()) throw new Error('symbolic link');
    const realFile = await resolveContainedPath(root, absolute);
    if (realFile === null || !(await lstat(realFile)).isFile()) throw new Error('not a contained file');
    return { absolute: realFile, relative: local };
  } catch {
    throw new UsageError(
      `${local} is not a regular file inside the game repo`,
      'gm assets register <path> --made-by-agent',
    );
  }
}

async function gameId(cwd: string, flag: unknown): Promise<string> {
  if (typeof flag === 'string') return flag;
  try {
    const doc = JSON.parse(await readFile(join(cwd, '.gm/game.json'), 'utf8')) as { gameId?: string; id?: string };
    const id = doc.gameId ?? doc.id;
    if (id) return id;
  } catch {
    // The actionable usage error below covers a missing or malformed game file.
  }
  throw new UsageError('no game id found in .gm/game.json', 'gm assets register <path> --made-by-agent --game <id>');
}

function idPath(path: string): string {
  const withoutExtension = path.slice(0, path.length - extname(path).length).replace(/^assets\//, '');
  return withoutExtension
    .split('/')
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('/');
}

function derivedLicense(sourceLicenses: string[]): string {
  if (sourceLicenses.length === 0) return 'LicenseRef-made-by-agent';
  return sourceLicenses.length === 1 ? sourceLicenses[0]! : 'LicenseRef-derived';
}

export const command: GmCommand = {
  name: 'assets register',
  summary: 'move an agent-made or derived asset into the blob store and record it in assets.lock.json',
  usage: '<path> --made-by-agent [--from <id>...] [--game <id>]',
  example: 'assets register assets/model/boss-door.glb --made-by-agent --from t1:pack/source@1 --game coin-hop',
  flags: {
    'made-by-agent': { type: 'boolean', default: false, help: 'confirm this output was made by an agent' },
    from: { type: 'string', multiple: true, help: 'source asset id; repeat for multiple sources' },
    game: { type: 'string', help: 'game id when .gm/game.json does not exist' },
  },
  async run(ctx, args, flags) {
    if (args.length !== 1)
      throw new UsageError('register needs exactly one path', 'gm assets register <path> --made-by-agent');
    if (flags['made-by-agent'] !== true) {
      throw new UsageError('--made-by-agent is required', 'gm assets register <path> --made-by-agent');
    }
    const file = await safeRelativePath(ctx.cwd, args[0]!);
    let lock = await readLock(ctx.cwd);
    if (lock === null)
      throw new UsageError('no assets.lock.json here', 'gm assets use <id> --family <family> --pov <pov>');

    const sourceIds = [...new Set(repeated(flags.from))];
    const sourceRights: LockEntry['rights'][] = [];
    let sourceLicenses: string[] = [];
    if (sourceIds.length > 0) {
      const index = await loadIndex(requireAssetsRoot(ctx));
      const byId = new Map(index.cards.map((card) => [card.id, card]));
      for (const id of sourceIds) {
        const card = byId.get(id);
        if (!card) throw new UsageError(`unknown source asset ${id}`, 'gm assets why <id>');
        sourceRights.push(rightsForCard(card, index.collections));
        sourceLicenses.push(card.resolved.license);
      }
    }
    const rights = intersectLockRights(sourceRights);
    if (rights.redistribution === 'none') {
      throw new UsageError('derived source rights prohibit redistribution', `gm assets why ${sourceIds[0]}`);
    }
    sourceLicenses = [...new Set(sourceLicenses)];
    const id = `t3:${await gameId(ctx.cwd, flags.game)}/${idPath(file.relative)}`;
    // D-ASSETS-REFERENCE: the bytes live in the instance blob store; the repo keeps only the lock entry.
    const bytes = await readFile(file.absolute);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await putBlob(ctx, bytes, sha256, MIME[extname(file.relative).toLowerCase()] ?? 'application/octet-stream');
    lock = upsertLock(lock, {
      id,
      sha256,
      source: 'blob',
      path: file.relative,
      license: derivedLicense(sourceLicenses),
      rights,
      ...(sourceIds.length > 0 ? { derived_from: sourceIds } : {}),
      added: new Date().toISOString().slice(0, 10),
    });
    await writeLock(ctx.cwd, lock);
    await writeGeneratedText(join(ctx.cwd, 'CREDITS.md'), renderCredits(lock));
    await unlink(file.absolute);
    ctx.emit('assets.register', { id, derived_from: sourceIds });
    return EXIT.ok;
  },
};
