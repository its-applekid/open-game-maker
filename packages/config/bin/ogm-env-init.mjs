#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fchmodSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { O_CREAT, O_EXCL, O_NOFOLLOW, O_TRUNC, O_WRONLY } from 'node:constants';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OGM_ENV_NAMES } from '../dist/names.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const validUnits = [...new Set(OGM_ENV_NAMES.map(({ unit }) => unit).filter((unit) => unit !== 'shared'))];

function fail(message) {
  process.stderr.write(`ogm-env-init: ${message}\n`);
  process.exit(2);
}

function parseArguments(args) {
  let unit;
  let directory = join(homedir(), '.config', 'ogm', 'env');
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--force') {
      force = true;
    } else if (argument === '--dir') {
      const value = args[index + 1];
      if (!value) fail('--dir requires a path');
      directory = resolve(value);
      index += 1;
    } else if (argument.startsWith('-')) {
      fail(`unknown option ${argument}`);
    } else if (unit === undefined) {
      unit = argument;
    } else {
      fail(`unexpected argument ${argument}`);
    }
  }

  if (!unit || !validUnits.includes(unit)) {
    fail(`unit must be one of: ${validUnits.join(', ')}`);
  }

  return { unit, directory, force };
}

function realpathAllowMissing(path) {
  let existing = resolve(path);
  const missing = [];

  while (!existsSync(existing)) {
    missing.unshift(basename(existing));
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }

  return resolve(realpathSync(existing), ...missing);
}

function findRepositoryRoot() {
  try {
    return realpathSync(
      execFileSync('git', ['-C', scriptDirectory, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch {
    return undefined;
  }
}

function pathIsInside(parent, child) {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent === '' ||
    (pathFromParent !== '..' && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent))
  );
}

function readExistingValues(directory) {
  const values = new Map();
  if (!existsSync(directory)) return values;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.env')) continue;

    for (const line of readFileSync(join(directory, entry.name), 'utf8').split(/\r?\n/)) {
      const separator = line.indexOf('=');
      if (separator <= 0) continue;
      const name = line.slice(0, separator);
      const value = line.slice(separator + 1);
      if (value.length > 0 && !values.has(name)) values.set(name, value);
    }
  }

  return values;
}

const { unit, directory, force } = parseArguments(process.argv.slice(2));
const resolvedDirectory = realpathAllowMissing(directory);
const repositoryRoot = findRepositoryRoot();

if (repositoryRoot && pathIsInside(repositoryRoot, resolvedDirectory)) {
  fail('refusing to write inside the repository');
}

mkdirSync(resolvedDirectory, { recursive: true, mode: 0o700 });

const target = join(resolvedDirectory, `${unit}.env`);
const existingValues = readExistingValues(resolvedDirectory);
const rows = OGM_ENV_NAMES.filter(({ unit: owner }) => owner === unit || owner === 'shared');
let generated = 0;
const lines = rows.map(({ name, kind }) => {
  if (kind !== 'secret') return `${name}=`;
  const existing = existingValues.get(name);
  if (existing) return `${name}=${existing}`;
  generated += 1;
  return `${name}=${randomBytes(32).toString('hex')}`;
});

const flags = O_WRONLY | O_CREAT | O_NOFOLLOW | (force ? O_TRUNC : O_EXCL);
let descriptor;
try {
  descriptor = openSync(target, flags, 0o600);
} catch (error) {
  if (!force && error?.code === 'EEXIST') fail(`refusing to overwrite ${target}`);
  if (error?.code === 'ELOOP') fail(`refusing to overwrite symbolic link ${target}`);
  fail(`could not open ${target} (${error?.code ?? 'unknown error'})`);
}

try {
  writeFileSync(descriptor, `${lines.join('\n')}\n`, 'utf8');
  fchmodSync(descriptor, 0o600);
} finally {
  closeSync(descriptor);
}
process.stdout.write(`wrote ${target} (${rows.length} names, ${generated} generated)\n`);
