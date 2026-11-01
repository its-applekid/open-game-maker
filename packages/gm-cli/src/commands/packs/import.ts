import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { printJson, requireAssetsRoot } from '../../context.js';
import { confirmCollection } from '../../packs/confirm.js';
import { importPack, PackRefusal } from '../../packs/importer.js';

export const command: GmCommand = {
  name: 'packs import',
  summary: 'safely import a quarantined asset drop or local archive',
  usage: '<dir|archive> --id <vendor-name> [--license <id>] [--version <v>] [--inspiration] [--from-queue <drop-id>]',
  example: 'packs import ./Kenney --id kenney-test --version 1 --json',
  flags: {
    id: { type: 'string', help: 'stable kebab-case pack id' },
    license: { type: 'string', help: 'known SPDX or LicenseRef id' },
    inspiration: { type: 'boolean', default: false, help: 'store outside game-material packs' },
    version: { type: 'string', help: 'vendor or intake version' },
    'from-queue': { type: 'string', help: 'Drive queue drop id' },
    confirm: { type: 'string', help: 'confirm an existing collection id' },
    'confirmed-by': { type: 'string', help: 'human who confirmed the license' },
    note: { type: 'string', help: 'confirmation note' },
    decision: { type: 'string', help: 'rights narrowing: uses=a,b;audience=private;redistribution=none;note=...' },
  },
  async run(ctx, args, flags) {
    const assetsRoot = requireAssetsRoot(ctx);
    try {
      if (typeof flags.confirm === 'string') {
        if (args.length > 0) throw new UsageError('--confirm does not take an input path', 'gm help packs import');
        if (typeof flags.license !== 'string' || typeof flags['confirmed-by'] !== 'string') {
          throw new UsageError('--confirm requires --license and --confirmed-by', 'gm help packs import');
        }
        const result = await confirmCollection({
          assetsRoot,
          collectionId: flags.confirm,
          license: flags.license,
          confirmedBy: flags['confirmed-by'],
          ...(typeof flags.note === 'string' ? { note: flags.note } : {}),
          ...(typeof flags.decision === 'string' ? { decision: flags.decision } : {}),
        });
        if (ctx.json) printJson(ctx, result);
        else ctx.out(`${result.collection}  ${result.license}  imported`);
        ctx.emit('packs.import', result);
        return EXIT.ok;
      }
      if (typeof flags.id !== 'string') throw new UsageError('--id is required', 'gm help packs import');
      if (args.length > 1 || (args.length === 0 && typeof flags['from-queue'] !== 'string')) {
        throw new UsageError('give one input directory/archive, or --from-queue', 'gm help packs import');
      }
      const result = await importPack({
        assetsRoot,
        cwd: ctx.cwd,
        ...(args[0] ? { input: args[0] } : {}),
        id: flags.id,
        ...(typeof flags.version === 'string' ? { version: flags.version } : {}),
        ...(typeof flags.license === 'string' ? { license: flags.license } : {}),
        inspiration: flags.inspiration === true,
        ...(typeof flags['from-queue'] === 'string' ? { fromQueue: flags['from-queue'] } : {}),
      });
      if (ctx.json) printJson(ctx, result);
      else ctx.out(`${result.collection}  ${result.status}  ${result.cards} card(s)`);
      ctx.emit('packs.import', result);
      return EXIT.ok;
    } catch (error) {
      if (error instanceof UsageError) throw error;
      if (error instanceof PackRefusal) throw new UsageError(error.message, 'gm help packs import');
      throw error;
    }
  },
};
