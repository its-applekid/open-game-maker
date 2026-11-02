import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { unpack } from './unpack.js';

export type NpmRunner = (
  file: string,
  args: string[],
  options: { maxBuffer: number; timeout: number; killSignal: 'SIGKILL'; env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

const execFile = promisify(execFileCallback);
const CAPS = { maxMembers: 200_000, maxUnpackedMb: 32_768, maxRatio: 200 };
const FETCH_TIMEOUT_MS = 30 * 60_000;

const defaultRunner: NpmRunner = async (file, args, options) => {
  const result = await execFile(file, args, options);
  return { stdout: result.stdout, stderr: result.stderr };
};

export async function packNpm(
  name: string,
  version: string,
  destination: string,
  runner: NpmRunner = defaultRunner,
): Promise<{ tgz: string; extracted: string }> {
  await mkdir(destination, { recursive: true });
  const emptyConfig = join(destination, '.npmrc-empty');
  await writeFile(emptyConfig, '');
  const cache = join(destination, '.npm-cache');
  const publicEnv: NodeJS.ProcessEnv = {
    LANG: 'C',
    npm_config_cache: cache,
    npm_config_globalconfig: emptyConfig,
    npm_config_ignore_scripts: 'true',
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_userconfig: emptyConfig,
  };
  const { stdout } = await runner(
    'npm',
    [
      'pack',
      `${name}@${version}`,
      '--pack-destination',
      destination,
      '--ignore-scripts',
      `--userconfig=${emptyConfig}`,
      `--globalconfig=${emptyConfig}`,
      '--registry=https://registry.npmjs.org/',
      `--cache=${cache}`,
    ],
    {
      maxBuffer: 16 * 1024 * 1024,
      timeout: FETCH_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: publicEnv,
    },
  );
  const filename = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!filename || !filename.endsWith('.tgz') || basename(filename) !== filename) {
    throw new Error(`npm pack did not report a safe tarball name: ${JSON.stringify(filename)}`);
  }
  const tgz = resolve(destination, filename);
  const extractedRoot = join(destination, 'extracted');
  await unpack(tgz, extractedRoot, CAPS);
  const manifest = JSON.parse(await readFile(join(extractedRoot, 'package.json'), 'utf8')) as {
    name?: string;
    version?: string;
  };
  if (manifest.name !== name) throw new Error(`npm mirror package mismatch: expected ${name}, actual ${manifest.name}`);
  if (manifest.version !== version) {
    throw new Error(`npm mirror version mismatch: expected ${version}, actual ${manifest.version}`);
  }
  return { tgz, extracted: extractedRoot };
}
