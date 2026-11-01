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
  await mkdir(dirname(lexical), { recursive: true });
  const parent = await realpath(dirname(lexical));
  if (!inside(root, parent)) throw new Error('output parent escapes the selected root');
  const output = resolve(parent, basename(lexical));
  try {
    if ((await lstat(output)).isSymbolicLink()) throw new Error('output is a symbolic link');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return output;
}
