import { posix } from 'node:path';

import type { BoundaryReason, BoundaryRule } from '../types.js';

const MIB = 1024 * 1024;
const MAX_FILE_BYTES = 25 * MIB;
const MAX_DIFF_BYTES = 200 * MIB;
const BINARY_EXTENSIONS = new Set([
  'glb',
  'gltf',
  'bin',
  'png',
  'webp',
  'ktx2',
  'mp3',
  'ogg',
  'wav',
  'json',
  'ico',
  'woff2',
]);

function reason(path: string | undefined, detail: string): BoundaryReason {
  return { code: 'size', ...(path === undefined ? {} : { path }), detail };
}

export const sizeRule: BoundaryRule = (input) => {
  const reasons: BoundaryReason[] = [];
  let totalBytes = 0;
  for (const file of input.files) {
    if (file.status === 'removed') continue;
    totalBytes += file.bytes;
    if (file.bytes > MAX_FILE_BYTES) reasons.push(reason(file.path, 'file is larger than 25 MiB'));
    const extension = posix.extname(file.path).slice(1).toLocaleLowerCase();
    if (file.binary && !BINARY_EXTENSIONS.has(extension)) {
      reasons.push(reason(file.path, 'file type not allowed in a game repository'));
    }
    if (
      input.visibility === 'public' &&
      (extension === 'map' || file.content?.includes('sourceMappingURL=') === true)
    ) {
      reasons.push(reason(file.path, 'source maps leak source on public repositories'));
    }
  }
  if (input.mode === 'diff' && totalBytes > MAX_DIFF_BYTES) {
    reasons.push(reason(undefined, 'pull request adds more than 200 MiB'));
  }
  return reasons;
};
