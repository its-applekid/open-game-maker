import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import * as tar from 'tar';

const execFile = promisify(execFileCallback);
const FETCH_TIMEOUT_MS = 30 * 60_000;

const PUBLIC_GIT_ENV: NodeJS.ProcessEnv = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  LANG: 'C',
};

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFile('git', ['-c', 'credential.helper=', '-c', 'http.extraheader=', ...args], {
    env: PUBLIC_GIT_ENV,
    maxBuffer: 16 * 1024 * 1024,
    timeout: FETCH_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  return stdout.trim();
}

export async function cloneAtPin(source: string, pin: string, destination: string): Promise<{ sha: string }> {
  await mkdir(dirname(destination), { recursive: true });
  await git(['clone', '--depth', '1', '--no-checkout', '--no-tags', '--', source, destination]);
  const initial = await git(['-C', destination, 'rev-parse', 'HEAD']);
  try {
    await git(['-C', destination, 'fetch', '--depth', '1', 'origin', pin]);
  } catch {
    throw new Error(`mirror pin mismatch: expected ${pin}, actual ${initial}`);
  }
  const expected = await git(['-C', destination, 'rev-parse', 'FETCH_HEAD^{commit}']);
  const archive = join(destination, `.mirror-${process.pid}.tar`);
  await git(['-C', destination, 'archive', '--format=tar', `--output=${archive}`, expected]);
  try {
    await tar.extract({
      cwd: destination,
      file: archive,
      strict: true,
      filter(_path, entry) {
        const type =
          'type' in entry ? entry.type : entry.isFile() ? 'File' : entry.isDirectory() ? 'Directory' : 'Other';
        if (type !== 'File' && type !== 'Directory') {
          throw new Error(`mirror contains unsupported archive entry type ${type}`);
        }
        return true;
      },
    });
  } finally {
    await rm(archive, { force: true });
  }
  await git(['-C', destination, 'update-ref', '--no-deref', 'HEAD', expected]);
  const actual = await git(['-C', destination, 'rev-parse', 'HEAD']);
  if (expected !== actual || (/^[a-f0-9]{40}$/i.test(pin) && pin.toLowerCase() !== actual.toLowerCase())) {
    throw new Error(`mirror pin mismatch: expected ${pin}, actual ${actual}`);
  }
  return { sha: actual };
}
