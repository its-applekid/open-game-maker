import { execFile } from 'node:child_process';

import type { CommandResult, RunCommand } from './bump.js';

const MAX_OUTPUT = 2 * 1024 * 1024;

/** Runs a command and reports its exit code instead of throwing, so callers decide what a failure means. */
export const runCommand: RunCommand = (file, args, options) =>
  new Promise<CommandResult>((resolve) => {
    execFile(
      file,
      [...args],
      { cwd: options.cwd, env: options.env, encoding: 'utf8', maxBuffer: MAX_OUTPUT, timeout: 20 * 60_000 },
      (error, stdout, stderr) => {
        const code =
          error === null
            ? 0
            : typeof (error as { code?: unknown }).code === 'number'
              ? (error as { code: number }).code
              : 1;
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? (error === null ? '' : error.message) });
      },
    );
  });
