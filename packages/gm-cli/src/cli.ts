import { fileURLToPath } from 'node:url';

import { loadEnv } from '@ogm/config';

import { EXIT, UsageError, type GmContext } from './command.js';
import { findAssetsRoot } from './context.js';
import { makeEmitter } from './events.js';
import { parseFlags } from './flags.js';
import { commandHelp, listHelp } from './help.js';
import { loadCommands, match } from './registry.js';

export type { FlagSpec, GmCommand, GmContext } from './command.js';
export { EXIT, UsageError } from './command.js';
export { printJson, requireAssetsRoot } from './context.js';
export { loadCommands } from './registry.js';

export const COMMANDS_DIR = fileURLToPath(new URL('./commands/', import.meta.url));

export type RunOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  commandsDir?: string;
  out?: (line: string) => void;
  err?: (line: string) => void;
};

const ENV = {
  OGM_ASSETS_ROOT: { kind: 'path', required: false },
  GM_EVENTS_FILE: { kind: 'path', required: false },
  GM_JOB: { kind: 'string', required: false },
} as const;

export async function run(argv: string[], options: RunOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err = options.err ?? ((line: string) => process.stderr.write(`${line}\n`));
  const cwd = options.cwd ?? process.cwd();
  const registry = await loadCommands(options.commandsDir ?? COMMANDS_DIR);

  try {
    if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
      const target = argv[0] === 'help' ? argv.slice(1) : [];
      if (target.length === 0) {
        listHelp(registry).forEach(out);
        return EXIT.ok;
      }
      const found = match(registry, target);
      if (!found) throw new UsageError(`unknown command "${target.join(' ')}"`, 'gm help');
      commandHelp(found.command).forEach(out);
      return EXIT.ok;
    }

    const found = match(registry, argv);
    if (!found)
      throw new UsageError(`unknown command "${argv.filter((a) => !a.startsWith('-')).join(' ')}"`, 'gm help');
    const { command, rest } = found;
    const { args, flags } = parseFlags(command.name, command.flags, rest);
    if (flags.help === true) {
      commandHelp(command).forEach(out);
      return EXIT.ok;
    }

    const env = options.env === undefined ? loadEnv('gm', ENV) : loadEnv('gm', ENV, options.env);
    const ctx: GmContext = {
      cwd,
      assetsRoot: findAssetsRoot(cwd, env.OGM_ASSETS_ROOT),
      json: flags.json === true,
      limit: flags.limit as number,
      fields:
        typeof flags.fields === 'string'
          ? flags.fields
              .split(',')
              .map((field) => field.trim())
              .filter(Boolean)
          : null,
      out,
      err,
      emit: makeEmitter(env.GM_EVENTS_FILE, env.GM_JOB),
    };
    return await command.run(ctx, args, flags);
  } catch (error) {
    if (error instanceof UsageError) {
      err(error.message);
      return EXIT.usage;
    }
    throw error;
  }
}
