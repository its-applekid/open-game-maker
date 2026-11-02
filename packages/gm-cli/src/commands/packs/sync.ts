import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { EXIT, UsageError, type GmCommand, type GmContext } from '../../command.js';
import { printJson, requireAssetsRoot } from '../../context.js';
import { lpcCollectionLicense } from '../../packs/credits-csv.js';
import { cloneAtPin } from '../../packs/git.js';
import { importPack } from '../../packs/importer.js';
import { validateLicenseMap, type LicenseMap } from '../../packs/license-map.js';
import { fontsourceMap, gameIconsMap, lpcCreditsMap, mapEveryFile } from '../../packs/mappers.js';
import { findMirror, MIRRORS, type Mirror } from '../../packs/mirrors.js';
import { packNpm } from '../../packs/npm.js';

type SyncOptions = { pin: string; destination: string; includeSa: boolean; confirmedBy: string };

function insideGameRepo(cwd: string): boolean {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.gm', 'game.json'))) return true;
    if (dirname(dir) === dir) return false;
  }
}

function insideRepository(path: string): boolean {
  for (let dir = resolve(path); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.gm', 'game.json'))) return true;
    if (dirname(dir) === dir) return false;
  }
}

function guardOperator(ctx: GmContext): void {
  if (ctx.config.jobId || ctx.config.aiurRunId || ctx.config.sandbox || insideGameRepo(ctx.cwd)) {
    throw new UsageError(
      'gm packs sync is an operator command and cannot run in a job, sandbox, or game repo',
      'gm help packs sync',
    );
  }
}

function mirrorName(mirror: Mirror): string {
  return mirror.id === 'fontsource' ? 'fontsource:<font>' : mirror.id;
}

function licenseLabel(mirror: Mirror): string {
  return mirror.license.mode === 'single' ? `single ${mirror.license.spdx}` : `per-item ${mirror.license.mapper}`;
}

function printList(ctx: GmContext): void {
  if (ctx.json) {
    printJson(
      ctx,
      MIRRORS.map((mirror) => ({
        id: mirrorName(mirror),
        kind: mirror.kind,
        pin: mirror.pin,
        license: licenseLabel(mirror),
      })),
    );
    return;
  }
  for (const mirror of MIRRORS)
    ctx.out(`${mirrorName(mirror)}  ${mirror.kind}  ${mirror.pin}  ${licenseLabel(mirror)}`);
}

function checkedPin(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value.includes('..')) {
    throw new UsageError(`unsafe mirror pin ${JSON.stringify(value)}`, 'gm packs sync --list');
  }
  return value;
}

function dryRunPlan(mirror: Mirror, pin: string, destination: string): { fetch: string; import: string } {
  const fetch =
    mirror.kind === 'git'
      ? `git clone --depth 1 ${mirror.source} ${destination}; checkout ${pin}`
      : `npm pack ${mirror.source}@${pin} --pack-destination ${destination} --ignore-scripts`;
  return {
    fetch,
    import: `gm packs import <fetched> --id ${mirror.id} --version ${pin} --tier 2 --license <mapped> --confirmed-by <human>`,
  };
}

async function mappedRights(
  mirror: Mirror,
  mirrorRoot: string,
  input: string,
  includeSa: boolean,
): Promise<{ license: string; attribution: string | null; map: LicenseMap }> {
  if (mirror.license.mode === 'single') {
    return {
      license: mirror.license.spdx,
      attribution: mirror.license.attribution,
      map: await mapEveryFile(input, mirror.license.spdx, mirror.license.attribution),
    };
  }
  if (mirror.license.mapper === 'lpc-credits-csv') {
    const map = await lpcCreditsMap(mirrorRoot, includeSa);
    return { license: lpcCollectionLicense(map), attribution: null, map };
  }
  if (mirror.license.mapper === 'game-icons-authors') {
    return { license: 'CC-BY-3.0', attribution: null, map: await gameIconsMap(input) };
  }
  const font = await fontsourceMap(input);
  if (!font.license) throw new Error(font.dropped ?? 'Fontsource package has no supported license');
  return { license: font.license, attribution: null, map: await mapEveryFile(input, font.license, null) };
}

export async function syncMirror(ctx: GmContext, mirror: Mirror, options: SyncOptions) {
  const assetsRoot = requireAssetsRoot(ctx);
  let input: string;
  let mirrorRoot: string;
  let resolvedPin = options.pin;
  if (mirror.kind === 'git') {
    mirrorRoot = join(options.destination, 'checkout');
    const checkout = await cloneAtPin(mirror.source, options.pin, mirrorRoot);
    resolvedPin = checkout.sha;
    await rm(join(mirrorRoot, '.git'), { recursive: true, force: true });
    input = mirror.subpaths?.[0] ? join(mirrorRoot, mirror.subpaths[0]) : mirrorRoot;
  } else {
    input = (await packNpm(mirror.source, options.pin, options.destination)).extracted;
    mirrorRoot = input;
  }
  const rights = await mappedRights(mirror, mirrorRoot, input, options.includeSa);
  const licenseMap = validateLicenseMap(rights.map);
  const fetched = new Date().toISOString();
  await mkdir(options.destination, { recursive: true });
  await writeFile(
    join(options.destination, 'sources.json'),
    `${JSON.stringify(
      {
        mirror: mirror.id,
        source: mirror.source,
        pin: options.pin,
        resolved_pin: resolvedPin,
        fetched,
        files: Object.keys(licenseMap).sort(),
      },
      null,
      2,
    )}\n`,
  );
  const result = await importPack({
    assetsRoot,
    cwd: ctx.cwd,
    input,
    id: mirror.id,
    title: mirror.title,
    version: options.pin,
    tier: 2,
    license: rights.license,
    licenseMap,
    licenseRef: mirror.license.ref,
    confirmedBy: options.confirmedBy,
    attribution: rights.attribution,
    source: { type: mirror.kind, url: mirror.source, pin: options.pin },
    inspiration: false,
  });
  const payload = {
    mirror: mirror.id,
    pin: options.pin,
    resolved_pin: resolvedPin,
    destination: options.destination,
    ...result,
  };
  ctx.emit('packs.sync', payload);
  return payload;
}

export const command: GmCommand = {
  name: 'packs sync',
  summary: 'fetch and import a pinned tier-2 mirror',
  usage: '<mirror> [--pin <ref>] [--dest <dir>] [--dry-run] [--include-sa] [--confirmed-by <name>] | --list',
  example: 'packs sync kaykit --dry-run',
  flags: {
    list: { type: 'boolean', default: false, help: 'show mirrors, pins, and licences' },
    pin: { type: 'string', help: 'override the reviewed commit or version' },
    dest: { type: 'string', help: 'download directory outside the game repo' },
    'dry-run': { type: 'boolean', default: false, help: 'print the fetch/import plan without network access' },
    'include-sa': { type: 'boolean', default: false, help: 'include LPC share-alike and GPL assets' },
    'confirmed-by': { type: 'string', help: 'human who confirmed the mirror licences' },
  },
  async run(ctx, args, flags) {
    guardOperator(ctx);
    if (flags.list === true) {
      if (args.length > 0) throw new UsageError('--list does not take a mirror', 'gm packs sync --list');
      printList(ctx);
      return EXIT.ok;
    }
    if (args.length !== 1) throw new UsageError('give one mirror id', 'gm packs sync --list');
    const mirror = findMirror(args[0]!);
    if (!mirror) {
      throw new UsageError(
        `unknown mirror ${JSON.stringify(args[0])}; choose ${MIRRORS.map(mirrorName).join(', ')}`,
        'gm packs sync --list',
      );
    }
    const pin = checkedPin(typeof flags.pin === 'string' ? flags.pin : mirror.pin);
    const destination = resolve(
      ctx.cwd,
      typeof flags.dest === 'string' ? flags.dest : join(homedir(), 'Downloads', 'ogm-mirrors', mirror.id, pin),
    );
    if (insideRepository(destination)) {
      throw new UsageError('--dest must be outside every Git and game repository', 'use ~/Downloads/ogm-mirrors');
    }
    if (flags['dry-run'] === true) {
      const plan = dryRunPlan(mirror, pin, destination);
      if (ctx.json) printJson(ctx, { mirror: mirror.id, pin, destination, ...plan });
      else {
        ctx.out(plan.fetch);
        ctx.out(plan.import);
      }
      ctx.emit('packs.sync', { mirror: mirror.id, pin, destination, dry_run: true });
      return EXIT.ok;
    }
    if (typeof flags['confirmed-by'] !== 'string' || !flags['confirmed-by'].trim()) {
      throw new UsageError(
        'a real sync requires --confirmed-by naming the human who checked the licences',
        'gm help packs sync',
      );
    }
    try {
      const result = await syncMirror(ctx, mirror, {
        pin,
        destination,
        includeSa: flags['include-sa'] === true,
        confirmedBy: flags['confirmed-by'],
      });
      if (ctx.json) printJson(ctx, result);
      else ctx.out(`${result.collection}  ${result.status}  ${result.cards} card(s), ${result.dropped.length} dropped`);
      return EXIT.ok;
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error), 'gm help packs sync');
    }
  },
};
