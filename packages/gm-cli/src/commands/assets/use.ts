import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { loadIndex, type ResolvedCard } from '@ogm/asset-cards';
import { povIdSchema, styleFamilyIdSchema, type LockEntry } from '@ogm/contracts';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { repoVisibility, requireAssetsRoot, resolveContainedPath } from '../../context.js';
import { renderCredits } from '../../credits.js';
import { readLock, sha256File, upsertLock, writeGeneratedText, writeLock } from '../../lock.js';
import { refusalsForUse, rightsForCard, type Refusal } from '../../rules.js';

type CopySource = { source: string; destination: string; primary: boolean; sha256?: string };

function safeDestination(cwd: string, value: string): string {
  if (isAbsolute(value))
    throw new UsageError('--dest must be relative to the game repo', 'gm assets use --dest assets');
  const parts = value.replaceAll('\\', '/').split('/');
  if (parts.some((part) => part === '..' || part === '.gm' || part === 'node_modules')) {
    throw new UsageError(
      '--dest must stay inside the game repo and outside .gm and node_modules',
      'gm assets use --dest assets',
    );
  }
  const destination = resolve(cwd, value);
  const root = resolve(cwd);
  if (destination !== root && !destination.startsWith(`${root}${sep}`)) {
    throw new UsageError('--dest escapes the game repo', 'gm assets use --dest assets');
  }
  return destination;
}

function collectionParts(card: ResolvedCard): { slug: string; version: string } {
  const match = /^t[123]:([^@]+)@(.+)$/.exec(card.collection ?? '');
  if (!match) throw new Error(`asset ${card.id} has no versioned collection id`);
  return { slug: match[1]!, version: match[2]! };
}

function extractedRoot(assetsRoot: string, card: ResolvedCard, collection: ResolvedCard): string {
  const { slug, version } = collectionParts(card);
  const manifest = collection.collection_info?.pack_manifest;
  const fromManifest = manifest?.replace(/^assets-local\//, '');
  const candidates = [
    ...(fromManifest ? [join(assetsRoot, dirname(fromManifest), version, 'extracted')] : []),
    join(assetsRoot, 'packs', slug, version, 'extracted'),
    join(assetsRoot, 'inspiration', slug, version, 'extracted'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

async function copySources(
  assetsRoot: string,
  destinationRoot: string,
  card: ResolvedCard,
  collection: ResolvedCard,
): Promise<{ copies: CopySource[]; refusal?: Refusal }> {
  const sourceFiles = card.source?.files.filter(
    (file) =>
      file.role === undefined || file.role === 'primary' || file.role === 'texture' || file.role === 'companion',
  );
  const primary = sourceFiles?.find((file) => file.role === 'primary') ?? sourceFiles?.[0];
  if (!primary || !card.kind) {
    return {
      copies: [],
      refusal: { code: 'rights', rule: 'missing-file', id: card.id, detail: 'card has no primary source file' },
    };
  }
  const { slug } = collectionParts(card);
  const root = extractedRoot(assetsRoot, card, collection);
  const copies: CopySource[] = [];
  for (const sourceFile of sourceFiles ?? []) {
    const source = resolve(root, sourceFile.path);
    let realSource: string;
    try {
      realSource = (await resolveContainedPath(root, source)) ?? '';
    } catch {
      realSource = '';
    }
    if (realSource === '') {
      return {
        copies: [],
        refusal: {
          code: 'rights',
          rule: 'missing-file',
          id: card.id,
          detail: `source file ${sourceFile.path} is missing or escapes the extracted collection`,
        },
      };
    }
    try {
      if (!(await stat(realSource)).isFile()) throw new Error('not a file');
    } catch {
      return {
        copies: [],
        refusal: {
          code: 'rights',
          rule: 'missing-file',
          id: card.id,
          detail: `source file ${sourceFile.path} is missing`,
        },
      };
    }
    copies.push({
      source: realSource,
      destination: join(destinationRoot, card.kind, slug, basename(sourceFile.path)),
      primary: sourceFile === primary,
    });
  }
  return { copies };
}

function refusalLine(refusal: Refusal): string {
  return `${refusal.id}  ${refusal.rule}  ${refusal.detail}. Try: gm assets why ${refusal.id}`;
}

async function idsFromArgs(cwd: string, args: string[], picks: unknown): Promise<string[]> {
  const ids = [...args];
  if (typeof picks === 'string') {
    const text = await readFile(resolve(cwd, picks), 'utf8');
    ids.push(
      ...text
        .split('\n')
        .map((line) => line.replace(/#.*$/, '').trim())
        .filter(Boolean),
    );
  }
  return [...new Set(ids)];
}

export const command: GmCommand = {
  name: 'assets use',
  summary: 'copy library assets into this game and update the rights lock and credits',
  usage: '<id...> [-f picks.txt] [--dest assets] [--placeholder] [--exception reason] [--refresh]',
  example: 'assets use t1:kenney-mini-dungeon/character-orc@2.0 --family chunky-low-poly --pov iso',
  flags: {
    file: { type: 'string', short: 'f', help: 'read one asset id per line (# comments allowed)' },
    dest: { type: 'string', default: 'assets', help: 'relative destination directory' },
    placeholder: { type: 'boolean', default: false, help: 'allow placeholder-only rights' },
    exception: { type: 'string', help: 'record why an out-of-family asset is intentional' },
    partial: { type: 'boolean', default: false, help: 'copy accepted ids even when another id is refused' },
    refresh: { type: 'boolean', default: false, help: 'refresh current rights for existing lock entries' },
    family: { type: 'string', help: 'style family when creating a new lock' },
    pov: { type: 'string', help: 'camera point of view when creating a new lock' },
  },
  async run(ctx, args, flags) {
    const assetsRoot = requireAssetsRoot(ctx);
    const index = await loadIndex(assetsRoot);
    const byId = new Map(index.cards.map((card) => [card.id, card]));
    let lock = await readLock(ctx.cwd);
    let ids = await idsFromArgs(ctx.cwd, args, flags.file);
    if (ids.length === 0 && flags.refresh === true && lock !== null) {
      ids = lock.assets.filter((entry) => !entry.id.startsWith('t3:')).map((entry) => entry.id);
    }
    if (ids.length === 0) throw new UsageError('no asset id given', 'gm assets use <id...>');

    if (lock === null) {
      const family = styleFamilyIdSchema.safeParse(flags.family);
      const pov = povIdSchema.safeParse(flags.pov);
      if (!family.success || !pov.success) {
        throw new UsageError(
          'a new lock needs valid --family and --pov values',
          'gm assets use <id> --family <family> --pov <pov>',
        );
      }
      lock = { version: 1, family: family.data, pov: pov.data, assets: [] };
    }

    const destinationRoot = safeDestination(ctx.cwd, flags.dest as string);
    const visibility = await repoVisibility(ctx.cwd);
    const exception = typeof flags.exception === 'string' ? flags.exception.trim() : undefined;
    if (exception === '') {
      throw new UsageError('--exception needs a reason', 'gm assets use <id> --exception "intentional contrast"');
    }
    const refusals: Refusal[] = [];
    const accepted: Array<{
      card: ResolvedCard;
      copies: CopySource[];
      existing?: LockEntry;
      familyException: boolean;
    }> = [];
    for (const id of ids) {
      const card = byId.get(id);
      if (!card || card.card_type !== 'asset') {
        refusals.push({ code: 'rights', rule: 'unknown-id', id, detail: 'asset is not present in the current index' });
        continue;
      }
      const withoutException = refusalsForUse(card, lock, { placeholder: flags.placeholder === true, visibility });
      const cardRefusals = refusalsForUse(card, lock, {
        placeholder: flags.placeholder === true,
        exception,
        visibility,
      });
      if (cardRefusals.length > 0) {
        refusals.push(...cardRefusals);
        continue;
      }
      const existing = lock.assets.find((entry) => entry.id === id);
      if (flags.refresh === true && existing) {
        accepted.push({
          card,
          copies: [],
          existing,
          familyException: withoutException.some((item) => item.rule === 'family-mismatch'),
        });
        continue;
      }
      const collection = card.collection === undefined ? undefined : index.collections[card.collection];
      if (!collection) {
        refusals.push({
          code: 'rights',
          rule: 'unknown-id',
          id,
          detail: 'asset collection is not present in the index',
        });
        continue;
      }
      const sources = await copySources(assetsRoot, destinationRoot, card, collection);
      if (sources.refusal) {
        refusals.push(sources.refusal);
        continue;
      }
      accepted.push({
        card,
        copies: sources.copies,
        existing,
        familyException: withoutException.some((item) => item.rule === 'family-mismatch'),
      });
    }

    if (refusals.length > 0 && flags.partial !== true) {
      refusals.forEach((item) => ctx.err(refusalLine(item)));
      ctx.emit('assets.use', { ids, refused: refusals.length });
      return EXIT.usage;
    }

    for (const item of accepted) {
      for (const copy of item.copies) {
        await mkdir(dirname(copy.destination), { recursive: true });
        const realDestination = await resolveContainedPath(ctx.cwd, dirname(copy.destination));
        if (realDestination === null) {
          throw new UsageError('asset destination resolves outside the game repo', 'gm assets use --dest assets');
        }
        try {
          if ((await lstat(copy.destination)).isSymbolicLink()) {
            throw new UsageError('asset destination is a symbolic link', 'remove the link and retry gm assets use');
          }
        } catch (error) {
          if (error instanceof UsageError) throw error;
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await copyFile(copy.source, copy.destination);
        const sourceSha = await sha256File(copy.source);
        copy.sha256 = await sha256File(copy.destination);
        if (sourceSha !== copy.sha256) {
          throw new Error(`copied asset failed sha256 verification: ${relative(ctx.cwd, copy.destination)}`);
        }
      }
      const primary = item.copies.find((copy) => copy.primary);
      const path = primary ? relative(ctx.cwd, primary.destination).replaceAll(sep, '/') : item.existing!.path;
      const sha256 = primary ? primary.sha256! : item.existing!.sha256;
      lock = upsertLock(lock, {
        id: item.card.id,
        sha256,
        path,
        license: item.card.resolved.license,
        rights: rightsForCard(item.card, index.collections),
        added: item.existing?.added ?? new Date().toISOString().slice(0, 10),
      });
      if (item.familyException) {
        ctx.emit('assets.family_exception', { id: item.card.id, reason: exception });
      }
    }
    if (accepted.length > 0) {
      await writeLock(ctx.cwd, lock);
      await writeGeneratedText(join(ctx.cwd, 'CREDITS.md'), renderCredits(lock));
    }
    refusals.forEach((item) => ctx.err(refusalLine(item)));
    ctx.emit('assets.use', { ids, refused: refusals.length });
    return refusals.length > 0 ? EXIT.usage : EXIT.ok;
  },
};
