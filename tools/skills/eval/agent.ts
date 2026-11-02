import { spawn } from 'node:child_process';

import type { EvalAgent, ProcessRunner } from './types.js';

const OUTPUT_LIMIT = 20 * 1024 * 1024;

export const runProcess: ProcessRunner = async (command, args, options) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let overflowed = false;
    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= OUTPUT_LIMIT) {
        overflowed = true;
        child.kill('SIGKILL');
        return current;
      }
      return `${current}${chunk.toString()}`.slice(0, OUTPUT_LIMIT);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, options.timeoutMs)
      : undefined;
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout,
        stderr: overflowed ? `${stderr}\nprocess output exceeded 20 MiB` : stderr,
        timedOut,
      });
    });
  });

/** Remove provider keys and ticket credentials while retaining local subscription login files. */
export function agentEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([name]) => !/(?:^|_)(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL)(?:_|$)|^(?:AWS|GH|GITHUB)_/i.test(name),
    ),
  );
}

export function agentCommand(
  agent: Exclude<EvalAgent, 'skipped'>,
  gameDir: string,
  prompt: string,
): {
  command: string;
  args: string[];
} {
  if (agent === 'codex') {
    return { command: 'codex', args: ['exec', '--sandbox', 'workspace-write', '-C', gameDir, prompt] };
  }
  return { command: 'claude', args: ['-p', '--permission-mode', 'acceptEdits', prompt] };
}

export function parseTokens(output: string): { input: number; output: number } | undefined {
  const read = (name: string): number | undefined => {
    const match = new RegExp(`${name}(?:\\s+tokens?)?\\s*[:=]\\s*([\\d,]+)`, 'i').exec(output);
    return match ? Number(match[1].replaceAll(',', '')) : undefined;
  };
  const input = read('input');
  const outputTokens = read('output');
  return input === undefined || outputTokens === undefined ? undefined : { input, output: outputTokens };
}
