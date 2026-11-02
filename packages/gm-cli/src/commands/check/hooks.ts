import { UsageError, type GmCommand } from '../../command.js';
import { runSelected } from './index.js';

export const command: GmCommand = {
  name: 'check hooks',
  summary: 'verify that the game module installs deterministic test hooks',
  usage: '[--json]',
  example: 'check hooks',
  flags: {},
  async run(ctx, args) {
    if (args.length > 0) throw new UsageError(`unexpected argument ${args[0]}`, 'gm help check hooks');
    return runSelected(ctx, { checks: ['hook-present'] });
  },
};
