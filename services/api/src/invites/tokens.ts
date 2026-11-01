import { createHash, randomBytes } from 'node:crypto';

export function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mint(): { token: string; hash: string } {
  const token = randomBytes(16).toString('base64url');
  return { token, hash: hashOf(token) };
}
