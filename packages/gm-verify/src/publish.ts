import {
  closeSync,
  constants,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const CREATE_NEW = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Creates `dest` as a new file (never an existing one, never through a final symlink) and fills it only once the
 * opened file is confirmed inside `root` (Linux `/proc/self/fd`, where the host runner lives). */
function createInside(root: string, dest: string, data: Buffer): void {
  const fd = openSync(dest, CREATE_NEW, 0o644);
  try {
    const real = realpathSync(`/proc/self/fd/${fd}`);
    if (!inside(root, real)) {
      unlinkSync(real);
      throw new Error(`refusing to write ${dest}: it resolves outside ${root}`);
    }
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

/**
 * Copies a host-private capture tree into the sandbox-owned `dest`, `report.json` last. The sandbox can change `dest`
 * at any moment, so nothing there is overwritten or followed: directories are created fresh (an existing one is
 * refused) and every file is created exclusively and checked to land inside `root`.
 */
export function publish(staging: string, dest: string, root: string): void {
  const files: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(staging, rel), { withFileTypes: true })) {
      const child = join(rel, entry.name);
      if (entry.isDirectory()) {
        mkdirSync(join(dest, child));
        if (!inside(root, realpathSync(join(dest, child))))
          throw new Error(`refusing to write ${join(dest, child)}: it resolves outside ${root}`);
        walk(child);
      } else if (entry.isFile()) files.push(child);
    }
  };
  walk('');
  files.sort((a, b) => Number(a === 'report.json') - Number(b === 'report.json'));
  for (const file of files) createInside(root, join(dest, file), readFileSync(join(staging, file)));
}
