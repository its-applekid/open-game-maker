#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fchmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { O_CREAT, O_EXCL, O_NOFOLLOW, O_WRONLY } from 'node:constants';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OGM_ENV_NAMES, OGM_ENV_UNITS } from '../dist/names.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

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

  if (!unit || !OGM_ENV_UNITS.includes(unit)) {
    fail(`unit must be one of: ${OGM_ENV_UNITS.join(', ')}`);
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
    let directory = realpathSync(scriptDirectory);
    while (true) {
      if (existsSync(join(directory, '.git'))) return directory;
      const parent = dirname(directory);
      if (parent === directory) return undefined;
      directory = parent;
    }
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

function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error ? error.code : 'unknown error';
}

function isSymbolicLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

function writeEnvironmentFile(target, contents, force) {
  if (force && isSymbolicLink(target)) fail(`refusing to overwrite symbolic link ${target}`);

  const temporary = join(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  let descriptor;

  try {
    descriptor = openSync(temporary, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
    writeFileSync(descriptor, contents, 'utf8');
    fchmodSync(descriptor, 0o600);
    closeSync(descriptor);
    descriptor = undefined;

    if (force) {
      renameSync(temporary, target);
    } else {
      linkSync(temporary, target);
      unlinkSync(temporary);
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The original write error is the useful failure.
      }
    }

    try {
      unlinkSync(temporary);
    } catch (cleanupError) {
      if (errorCode(cleanupError) !== 'ENOENT') {
        fail(`could not clean up a temporary environment file (${errorCode(cleanupError)})`);
      }
    }

    if (!force && errorCode(error) === 'EEXIST') fail(`refusing to overwrite ${target}`);
    fail(`could not write ${target} (${errorCode(error)})`);
  }
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
// web.env feeds a public build, so it gets its own origins and never the shared secrets.
const rows = OGM_ENV_NAMES.filter(({ unit: owner }) => owner === unit || (owner === 'shared' && unit !== 'web'));
let generated = 0;
const lines = rows.map(({ name, kind }) => {
  if (kind !== 'secret') return `${name}=`;
  const existing = existingValues.get(name);
  if (existing) return `${name}=${existing}`;
  generated += 1;
  return `${name}=${randomBytes(32).toString('hex')}`;
});

writeEnvironmentFile(target, `${lines.join('\n')}\n`, force);
process.stdout.write(`wrote ${target} (${rows.length} names, ${generated} generated)\n`);
