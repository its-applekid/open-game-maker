import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import sharp from 'sharp';

function within(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

async function inputBelow(root, key) {
  const candidate = await realpath(resolve(root, key));
  if (!within(root, candidate)) throw new Error(`thumbnail input escapes asset root: ${key}`);
  return candidate;
}

async function outputBelow(root, key) {
  const candidate = resolve(root, key);
  if (!within(root, candidate)) throw new Error(`thumbnail output escapes asset root: ${key}`);
  await mkdir(dirname(candidate), { recursive: true });
  const parent = await realpath(dirname(candidate));
  if (!within(root, parent)) throw new Error(`thumbnail output parent escapes asset root: ${key}`);
  return join(parent, basename(candidate));
}

const assetsRoot = await realpath(resolve(process.argv[2]));
const jobs = JSON.parse(await new Response(process.stdin).text());
if (!Array.isArray(jobs)) throw new Error('thumbnail job input must be an array');

for (const job of jobs) {
  if (typeof job?.input !== 'string' || typeof job?.output !== 'string') throw new Error('invalid thumbnail job');
  const input = await inputBelow(assetsRoot, job.input);
  const output = await outputBelow(assetsRoot, job.output);
  if (existsSync(output)) {
    if ((await realpath(output)) !== output) throw new Error(`thumbnail output is a symlink: ${job.output}`);
    continue;
  }
  const temporary = `${output}.${process.pid}.${randomUUID()}.tmp.webp`;
  try {
    let image = sharp(input, { limitInputPixels: 268_402_689 });
    if (job.extract) image = image.extract(job.extract);
    await image
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(temporary);
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}
