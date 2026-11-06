#!/usr/bin/env node
// Read only the public logo setting from web.env for the build. Never source the file: it may gain unrelated values.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

import { readEnvValue } from './games-origin.mjs';

const NAME = 'VITE_INSTANCE_LOGO_URL';
const SUPPORTED_LOGO_PATH = /\.(?:png|webp|svg)$/i;

export function readInstanceLogoUrl(envDir) {
  const file = join(envDir, 'web.env');
  if (!existsSync(file)) throw new Error(`${NAME} cannot be read: ${file} is missing (run ogm-env-init web)`);
  const source = readEnvValue(file, NAME);
  if (!source) return '';

  const rootRelative = source.startsWith('/') && !source.startsWith('//');
  let url;
  try {
    url = rootRelative ? new URL(source, 'https://instance.invalid') : new URL(source);
  } catch {
    throw new Error(`${NAME} in ${file} must be a root-relative path or HTTPS URL`);
  }

  if ((!rootRelative && url.protocol !== 'https:') || !SUPPORTED_LOGO_PATH.test(url.pathname)) {
    throw new Error(`${NAME} in ${file} must point to a PNG, WebP, or SVG over HTTPS or a root-relative path`);
  }

  return source;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envDir = process.env.OGM_ENV_DIR || join(homedir(), '.config', 'ogm', 'env');
  try {
    process.stdout.write(`${readInstanceLogoUrl(envDir)}\n`);
  } catch (error) {
    process.stderr.write(`deploy: ${error.message}\n`);
    process.exit(1);
  }
}
