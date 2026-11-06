import { spawn } from 'node:child_process';

export type CommandResult = { readonly code: number; readonly stdout: string; readonly stderr: string };

export type CommandOptions = { readonly cwd: string; readonly env: Readonly<Record<string, string>> };

export type RunCommand = (file: string, args: readonly string[], options: CommandOptions) => Promise<CommandResult>;

/**
 * Runs one command without a shell. The environment given here is added to the inherited one, so a
 * token passed as an environment value reaches the child without appearing in `ps` output or logs.
 */
export const runCommand: RunCommand = (file, args, options) =>
  new Promise((resolve, reject) => {
    // The inherited environment goes to the child untouched; only the extra names are added here.
    // eslint-disable-next-line no-restricted-properties
    const child = spawn(file, args, { cwd: options.cwd, env: { ...process.env, ...options.env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
