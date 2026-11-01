export type BlobHash = `sha256:${string}`;

const blobHashPattern = /^sha256:[0-9a-f]{64}$/;

export function isBlobHash(value: unknown): value is BlobHash {
  return typeof value === 'string' && blobHashPattern.test(value);
}

export function assertBlobHash(value: unknown): asserts value is BlobHash {
  if (!isBlobHash(value)) throw new TypeError('Invalid blob hash');
}

export function blobHex(hash: BlobHash): string {
  assertBlobHash(hash);
  return hash.slice('sha256:'.length);
}
