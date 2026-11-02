#!/usr/bin/env node
// Print the games origin deploy.sh bakes into the build, read from <env dir>/web.env.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

const NAME = 'VITE_GAMES_ORIGIN';

export function readGamesOrigin(envDir) {
  const file = join(envDir, 'web.env');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`${NAME} is not set: ${file} is missing (run ogm-env-init web)`);
  }
  // Read only this name; never echo other lines.
  const lines = text.split(/\r?\n/).filter((line) => line.startsWith(`${NAME}=`));
  const raw = (lines.at(-1) ?? '')
    .slice(NAME.length + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
  if (!raw) throw new Error(`${NAME} is not set in ${file}`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${NAME} in ${file} is not a URL`);
  }
  // The deployed app is served over https, so an http games frame would be blocked as mixed content.
  if (url.protocol !== 'https:' || url.origin !== raw.replace(/\/$/, '')) {
    throw new Error(`${NAME} in ${file} must be a bare https origin`);
  }
  return url.origin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envDir = process.env.OGM_ENV_DIR || join(homedir(), '.config', 'ogm', 'env');
  try {
    process.stdout.write(`${readGamesOrigin(envDir)}\n`);
  } catch (error) {
    process.stderr.write(`deploy: ${error.message}\n`);
    process.exit(1);
  }
}
