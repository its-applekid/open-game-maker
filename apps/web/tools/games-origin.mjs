#!/usr/bin/env node
// Read deploy settings from <env dir>/web.env. The CLI prints the games origin by default, or the resolved instance
// asset mode when passed --instance-all-assets.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

// Read only this name; never echo other lines, since unit files also hold secrets.
function readValue(file, name) {
  const lines = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith(`${name}=`));
  return (lines.at(-1) ?? '')
    .slice(name.length + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
}

// web.env holds the value; the matching name in the serving unit's env file must agree when that file exists.
function readOrigin(envDir, name, servingUnit) {
  const file = join(envDir, 'web.env');
  if (!existsSync(file)) throw new Error(`${name} is not set: ${file} is missing (run ogm-env-init web)`);
  const raw = readValue(file, name);
  if (!raw) throw new Error(`${name} is not set in ${file}`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} in ${file} is not a URL`);
  }
  // The deployed app is served over https, so an http games frame or API proxy would be blocked or downgrade cookies.
  if (url.protocol !== 'https:' || url.origin !== raw.replace(/\/$/, '')) {
    throw new Error(`${name} in ${file} must be a bare https origin`);
  }
  if (servingUnit) {
    const [unitFile, unitName] = servingUnit;
    const servingFile = join(envDir, unitFile);
    const accepted = existsSync(servingFile) ? readValue(servingFile, unitName).replace(/\/$/, '') : '';
    if (accepted && accepted !== url.origin) {
      throw new Error(`${name} in ${file} differs from ${unitName} in ${servingFile}`);
    }
  }
  return url.origin;
}

// Rooms accepts only draft URLs on its OGM_GAMES_ORIGIN; a stale web.env would ship an app whose drafts it drops.
export const readGamesOrigin = (envDir) => readOrigin(envDir, 'VITE_GAMES_ORIGIN', ['rooms.env', 'OGM_GAMES_ORIGIN']);

// The API serves auth on OGM_PUBLIC_ORIGIN; proxying anywhere else would break sign-in.
export const readApiOrigin = (envDir) => readOrigin(envDir, 'VITE_API_ORIGIN', ['api.env', 'OGM_PUBLIC_ORIGIN']);

// The custom domain is deployment configuration, so previews and self-hosted deployments do not bake in this host's URL.
export const readPublicAppOrigin = (envDir) => readOrigin(envDir, 'OGM_PUBLIC_APP_ORIGIN');

export function readInstanceAllAssets(envDir) {
  const name = 'OGM_INSTANCE_ALL_ASSETS';
  const file = join(envDir, 'web.env');
  if (!existsSync(file)) throw new Error(`${name} is not set: ${file} is missing (run ogm-env-init web)`);
  const raw = readValue(file, name);
  if (raw === '' || raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`${name} in ${file} expected true, false, 1, or 0`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envDir = process.env.OGM_ENV_DIR || join(homedir(), '.config', 'ogm', 'env');
  try {
    const mode = process.argv[2];
    if (mode && mode !== '--instance-all-assets') {
      throw new Error(`usage: ${process.argv[1]} [--instance-all-assets]`);
    }
    process.stdout.write(`${mode ? Number(readInstanceAllAssets(envDir)) : readGamesOrigin(envDir)}\n`);
  } catch (error) {
    process.stderr.write(`deploy: ${error.message}\n`);
    process.exit(1);
  }
}
