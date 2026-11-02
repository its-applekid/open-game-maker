import { posix } from 'node:path';

import type { BoundaryFile, BoundaryReason, BoundaryRule } from '../types.js';

const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;

function reservedPath(path: string, actor: 'agent' | 'platform'): string | undefined {
  const normalized = path.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized) || segments.includes('..')) {
    return 'path escapes the game repository';
  }
  if ((normalized === '.github' || normalized.startsWith('.github/')) && actor !== 'platform') {
    return '.github changes require a platform template refresh';
  }
  if (segments.some((segment) => segment === '.gm' || segment === 'assets-local' || segment === 'node_modules')) {
    return 'reserved repository path';
  }
  if (segments.some((segment) => /^\.env(?:\..*)?$/u.test(segment))) return 'environment file is not allowed';
  const basename = segments.at(-1) ?? '';
  if (/\.pem$/iu.test(basename) || /^id_rsa/iu.test(basename)) return 'private key file is not allowed';
  if (basename === '.DS_Store') return 'operating-system metadata is not allowed';
  return undefined;
}

function escapingSymlink(file: BoundaryFile): boolean {
  if (file.mode !== '120000' || file.content === undefined) return false;
  const target = file.content.trim();
  const resolved = posix.resolve('/repo', posix.dirname(file.path.replaceAll('\\', '/')), target);
  return resolved !== '/repo' && !resolved.startsWith('/repo/');
}

function personalFilename(path: string, profileNames: string[]): boolean {
  const basename = posix.basename(path.replaceAll('\\', '/'));
  const folded = basename.toLocaleLowerCase();
  return (
    email.test(basename) ||
    profileNames.some((term) => term.trim().length > 1 && folded.includes(term.trim().toLocaleLowerCase()))
  );
}

function reason(path: string, detail: string): BoundaryReason {
  return { code: 'path', path, detail };
}

export const pathRule: BoundaryRule = (input) => {
  const reasons: BoundaryReason[] = [];
  for (const file of input.files) {
    if (file.status === 'removed') continue;
    const reserved = reservedPath(file.path, input.actor);
    if (reserved !== undefined) reasons.push(reason(file.path, reserved));
    else if (escapingSymlink(file)) reasons.push(reason(file.path, 'symbolic link escapes the game repository'));
    else if (personalFilename(file.path, input.profileNames)) {
      reasons.push(reason(file.path, 'file name contains personal information'));
    }
  }
  return reasons;
};
