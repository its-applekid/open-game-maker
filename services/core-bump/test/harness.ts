import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CommandOptions, RunCommand } from '../src/bump.js';

export const OLD = '1'.repeat(40);
export const NEW = '2'.repeat(40);
export const TOKEN = 'ghs-installation-token-value';

export type Call = { readonly file: string; readonly args: readonly string[]; readonly options: CommandOptions };

export type HarnessOptions = {
  readonly script?: boolean;
  readonly scriptExit?: number;
  readonly writtenPin?: string;
  readonly dirty?: boolean;
  readonly cloneFails?: string;
  readonly branchExists?: boolean;
};

/**
 * Stands in for git and bash: a clone creates the checkout with its bump script and pinned core, and the
 * bump script writes the target commit into `vendor/core.json`.
 */
export function harness(options: HarnessOptions = {}) {
  const calls: Call[] = [];
  const run: RunCommand = async (file, args, commandOptions) => {
    calls.push({ file, args: [...args], options: commandOptions });
    const ok = { code: 0, stdout: '', stderr: '' };

    if (file === 'git' && args[0] === 'clone') {
      if (options.cloneFails !== undefined) return { code: 128, stdout: '', stderr: options.cloneFails };
      const dir = args[args.length - 1] ?? '';
      await mkdir(join(dir, 'scripts'), { recursive: true });
      if (options.script !== false) await writeFile(join(dir, 'scripts', 'bump-core.sh'), '#!/usr/bin/env bash\n');
      await mkdir(join(dir, 'vendor'), { recursive: true });
      await writeFile(join(dir, 'vendor', 'core.json'), JSON.stringify({ core: { sha: OLD } }));
      return ok;
    }

    if (file === 'bash') {
      if ((options.scriptExit ?? 0) !== 0) {
        return { code: options.scriptExit ?? 0, stdout: '', stderr: 'vendor tarball download failed' };
      }
      await writeFile(
        join(commandOptions.cwd, 'vendor', 'core.json'),
        JSON.stringify({ core: { sha: options.writtenPin ?? args[1] } }),
      );
      return ok;
    }

    if (file === 'git' && args[0] === 'ls-remote') {
      return { code: 0, stdout: options.branchExists === true ? 'abc123\trefs/heads/core-bump\n' : '', stderr: '' };
    }

    if (file === 'git' && args[0] === 'status') {
      return { code: 0, stdout: options.dirty === false ? '' : ' M vendor/core.json\n', stderr: '' };
    }

    return ok;
  };

  return { calls, run };
}

export async function workRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ogm-core-bump-'));
}
