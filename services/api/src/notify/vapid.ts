import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import webpush from 'web-push';

type VapidClient = Pick<typeof webpush, 'generateVAPIDKeys' | 'setVapidDetails'>;
type VapidFile = { publicKey: string; privateKey: string; subject: string };
type VapidDetails = { publicKey: string; subject: string };

function readVapid(path: string, subject: string): VapidFile {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<VapidFile>;
    if (typeof parsed.publicKey !== 'string' || typeof parsed.privateKey !== 'string') throw new Error('invalid');
    return { publicKey: parsed.publicKey, privateKey: parsed.privateKey, subject };
  } catch (error) {
    throw new Error(`vapid: could not load ${path}`, { cause: error });
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

export function loadOrCreateVapid(
  path: string,
  subject: string,
  options: { client?: VapidClient; log?: (line: Record<string, unknown>) => void } = {},
): VapidDetails {
  const client = options.client ?? webpush;
  let action: 'generated' | 'loaded' = 'loaded';
  let details: VapidFile;

  try {
    details = readVapid(path, subject);
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (errorCode(cause) !== 'ENOENT') throw error;
    const directory = dirname(path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const keys = client.generateVAPIDKeys();
    try {
      writeFileSync(path, JSON.stringify({ ...keys, subject }), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      action = 'generated';
    } catch (writeError) {
      if (errorCode(writeError) !== 'EEXIST') throw new Error(`vapid: could not create ${path}`, { cause: writeError });
    }
    details = readVapid(path, subject);
  }

  chmodSync(path, 0o600);
  client.setVapidDetails(details.subject, details.publicKey, details.privateKey);
  options.log?.({ event: 'vapid', action, path });
  return { publicKey: details.publicKey, subject: details.subject };
}
