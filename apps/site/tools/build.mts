import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderSetupHtml, renderSplashHtml } from '../dist/render/html.js';
import { renderSetupMarkdown } from '../dist/render/markdown.js';
import { loadSetupContent } from '../dist/schema.js';
import { loadSplashContent } from '../dist/splash.js';

const packageRoot = new URL('../', import.meta.url);
const repositoryRoot = new URL('../../../', import.meta.url);
const sourcePath = fileURLToPath(new URL('content/setup.yaml', packageRoot));
const targetPath = fileURLToPath(new URL('SETUP.md', repositoryRoot));
const content = loadSetupContent(sourcePath, fileURLToPath(repositoryRoot));
const generated = renderSetupMarkdown(content);
const splash = loadSplashContent(fileURLToPath(new URL('content/splash.yaml', packageRoot)));

if (process.argv.includes('--check')) {
  let current;
  try {
    current = await readFile(targetPath, 'utf8');
  } catch {
    throw new Error('Generated SETUP.md is missing; run pnpm --filter @ogm/site build');
  }

  if (current !== generated) {
    throw new Error('Generated SETUP.md is stale; run pnpm --filter @ogm/site build');
  }
} else {
  await writeFile(targetPath, generated);
}

const distRoot = new URL('dist/', packageRoot);
await mkdir(new URL('setup/', distRoot), { recursive: true });
await writeFile(new URL('setup/index.html', distRoot), renderSetupHtml(content));
await copyFile(new URL('apps/web/src/tokens.css', repositoryRoot), new URL('tokens.css', distRoot));
await copyFile(new URL('src/site.css', packageRoot), new URL('site.css', distRoot));

// the splash at /: public/ (hero, captures, _headers) is copied as-is; media URLs carry a content hash so the immutable
// cache in _headers still picks up a re-recorded clip
await cp(new URL('public/', packageRoot), distRoot, { recursive: true });
const publicDir = fileURLToPath(new URL('public', packageRoot));
const hashed = (path: string) =>
  `${path}?v=${createHash('sha256')
    .update(readFileSync(`${publicDir}${path}`))
    .digest('hex')
    .slice(0, 10)}`;
await writeFile(new URL('index.html', distRoot), renderSplashHtml(splash, hashed));
