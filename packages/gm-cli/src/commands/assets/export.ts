import { randomBytes } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { loadIndex } from '@ogm/asset-cards';

import { planAll, planUsed, scanGames, gameIdOf, type ExportPlan, type Game } from '../../assets-export/plan.js';
import { ZipWriter } from '../../assets-export/zip-write.js';
import { CommandError, EXIT, UsageError, type GmCommand, type GmContext } from '../../command.js';
import { requireAssetsRoot } from '../../context.js';
import { renderCredits } from '../../credits.js';
import { readLock } from '../../lock.js';

const USAGE = 'gm assets export --used [--game <id>|--all-games] [--out <zip>]';

async function gamesInScope(ctx: GmContext, flags: Record<string, unknown>): Promise<Game[]> {
  const gamesDir = resolve(ctx.cwd, (flags['games-dir'] as string | undefined) ?? '.');
  if (flags['all-games'] === true) return scanGames(gamesDir);
  if (typeof flags.game === 'string') {
    const game = (await scanGames(gamesDir)).find((candidate) => candidate.id === flags.game);
    if (!game)
      throw new UsageError(
        `no game ${flags.game} under ${gamesDir}`,
        'gm assets export --used --game <id> --games-dir <dir>',
      );
    return [game];
  }
  const lock = await readLock(ctx.cwd);
  if (lock === null) throw new UsageError('no assets.lock.json in this directory', USAGE);
  return [{ id: await gameIdOf(ctx.cwd), dir: ctx.cwd, lock }];
}

function megabytes(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/** The report a reader of the zip (and `gm assets import`) relies on: every file with its sha, and what was left out. */
function report(
  scope: string,
  games: Game[],
  plan: ExportPlan,
  written: Map<string, { bytes: number; sha256: string }>,
) {
  return {
    version: 1,
    scope,
    games: games.map((game) => game.id),
    included: plan.files.map((file) => ({
      path: file.path,
      sha256: written.get(file.path)!.sha256,
      bytes: written.get(file.path)!.bytes,
      ids: file.ids,
      ...(file.license ? { license: file.license } : {}),
      ...(file.rights ? { rights: file.rights } : {}),
      ...(file.mime ? { mime: file.mime } : {}),
      ...(file.restricted ? { restricted: true } : {}),
    })),
    excluded: plan.excluded,
    restricted: plan.restricted,
  };
}

function creditsFor(plan: ExportPlan): string {
  const byId = new Map<string, { id: string; license: string; rights: { attribution: string | null } }>();
  for (const file of plan.files) {
    if (!file.license) continue;
    for (const id of file.ids) {
      byId.set(id, { id, license: file.license, rights: { attribution: file.rights?.attribution ?? null } });
    }
  }
  return renderCredits({ assets: [...byId.values()] });
}

export const command: GmCommand = {
  name: 'assets export',
  summary: 'zip the library and blob-store assets a clone needs, with credits, locks and a rights report',
  usage:
    '--used [--game <id>|--all-games] [--games-dir <dir>] [--out <zip>] [--include-restricted] | --all [--out <zip>]',
  example: 'assets export --used --out my-game-assets.zip',
  flags: {
    used: { type: 'boolean', default: false, help: 'every asset the lock(s) of the games in scope name' },
    all: { type: 'boolean', default: false, help: 'every pack and blob this instance holds' },
    game: { type: 'string', help: 'one game id under --games-dir (default: the game in this directory)' },
    'all-games': { type: 'boolean', default: false, help: 'every game repo under --games-dir' },
    'games-dir': { type: 'string', help: 'directory whose child directories are game repos (default: .)' },
    out: { type: 'string', help: 'zip path (default: assets-used.zip or assets-all.zip)' },
    'include-restricted': {
      type: 'boolean',
      default: false,
      help: 'also export assets whose rights forbid redistribution',
    },
  },
  async run(ctx, _args, flags) {
    if ((flags.used === true) === (flags.all === true))
      throw new UsageError('pick exactly one of --used and --all', USAGE);
    if (flags.game !== undefined && flags['all-games'] === true) {
      throw new UsageError('--game and --all-games cannot be combined', USAGE);
    }
    if (flags.all === true && (flags.game !== undefined || flags['all-games'] === true)) {
      throw new UsageError(
        '--all exports every pack and blob; --game and --all-games apply to --used',
        'gm assets export --all',
      );
    }
    const scope = flags.all === true ? 'all' : 'used';
    const includeRestricted = flags['include-restricted'] === true;
    const out = resolve(ctx.cwd, (flags.out as string | undefined) ?? `assets-${scope}.zip`);

    let games: Game[];
    let plan: ExportPlan;
    if (scope === 'all') {
      const assetsRoot = requireAssetsRoot(ctx);
      games = await scanGames(resolve(ctx.cwd, (flags['games-dir'] as string | undefined) ?? '.'));
      plan = await planAll(games, assetsRoot, ctx.blobRoot, await loadIndex(assetsRoot), includeRestricted);
    } else {
      games = await gamesInScope(ctx, flags);
      const needsLibrary = games.some((game) => game.lock.assets.some((entry) => !entry.id.startsWith('t3:')));
      const index = needsLibrary && ctx.assetsRoot ? await loadIndex(ctx.assetsRoot) : null;
      plan = await planUsed(games, ctx.assetsRoot, ctx.blobRoot, index, includeRestricted);
    }
    if (plan.missing.length > 0) {
      plan.missing.forEach((line) => ctx.err(line));
      throw new CommandError(
        `${plan.missing.length} asset(s) could not be found; nothing was exported. Try: gm packs sync`,
      );
    }
    for (const item of plan.restricted) {
      const name = item.ids.join(', ') || item.path!;
      ctx.err(
        includeRestricted
          ? `warning: exporting restricted ${name} (${item.reason})`
          : `left out ${name} (${item.reason}); add --include-restricted to export it`,
      );
    }

    const temporary = join(dirname(out), `.${basename(out)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    const zip = await ZipWriter.create(temporary);
    const written = new Map<string, { bytes: number; sha256: string }>();
    let total = 0;
    let lastProgress = Date.now();
    try {
      for (const [index, file] of plan.files.entries()) {
        const result = await zip.addFile(file.path, file.file);
        if (file.sha256 !== undefined && result.sha256 !== file.sha256) {
          throw new CommandError(
            `${file.ids.join(', ')}: ${file.path} has sha256 ${result.sha256}, the lock pins ${file.sha256}; nothing was exported. Try: gm packs sync`,
          );
        }
        written.set(file.path, result);
        total += result.bytes;
        if (!ctx.json && Date.now() - lastProgress >= 1000) {
          lastProgress = Date.now();
          ctx.err(`export: ${index + 1}/${plan.files.length} files, ${megabytes(total)}`);
        }
      }
      await zip.addBuffer('CREDITS.md', Buffer.from(creditsFor(plan)));
      for (const game of games) {
        await zip.addFile(`locks/${game.id}/assets.lock.json`, join(game.dir, 'assets.lock.json'));
      }
      await zip.addBuffer(
        'rights-report.json',
        Buffer.from(`${JSON.stringify(report(scope, games, plan, written), null, 2)}\n`),
      );
      await zip.close();
      await rename(temporary, out);
    } catch (error) {
      await zip.abort();
      throw error;
    } finally {
      await rm(temporary, { force: true });
    }

    const summary = {
      out,
      scope,
      games: games.map((game) => game.id),
      files: plan.files.length,
      bytes: total,
      excluded: plan.excluded.flatMap((item) => (item.ids.length > 0 ? item.ids : [item.path!])),
    };
    ctx.emit('assets.export', summary);
    if (ctx.json) ctx.out(JSON.stringify(summary));
    else {
      ctx.out(
        `exported ${plan.files.length} files (${megabytes(total)}) to ${out}${plan.excluded.length > 0 ? `; left out ${plan.excluded.length} restricted` : ''}`,
      );
    }
    return EXIT.ok;
  },
};
