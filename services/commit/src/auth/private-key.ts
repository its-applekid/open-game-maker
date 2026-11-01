import { readFile, stat } from 'node:fs/promises';

export async function readPrivateKey(path: string): Promise<string> {
  const details = await stat(path);
  if ((details.mode & 0o777) !== 0o600) {
    throw new Error('GitHub App private key must have mode 0600');
  }
  return readFile(path, 'utf8');
}
