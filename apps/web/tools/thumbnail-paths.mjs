import { lstat, mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export async function safeInput(root, requested) {
  const lexical = resolve(root, requested);
  if (!inside(root, lexical)) throw new Error('input escapes the selected root');
  const canonical = await realpath(lexical);
  if (!inside(root, canonical)) throw new Error('input escapes the selected root');
  return canonical;
}

export async function safeOutput(root, requested) {
  const lexical = resolve(root, requested);
  if (!inside(root, lexical)) throw new Error('output escapes the selected root');
  let parent = root;
  for (const segment of relative(root, dirname(lexical)).split(sep).filter(Boolean)) {
    const next = resolve(parent, segment);
    try {
      await mkdir(next);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    const stat = await lstat(next);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('output parent is not a real directory');
    parent = await realpath(next);
    if (!inside(root, parent)) throw new Error('output parent escapes the selected root');
  }
  const output = resolve(parent, basename(lexical));
  try {
    const stat = await lstat(output);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('output is not a real file');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return output;
}
