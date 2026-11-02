import { readFile, stat } from 'node:fs/promises';

export type BlocklistLoader = { load(): Promise<ReadonlySet<string> | null> };

export function parseBlocklist(content: string): Set<string> {
  const hashes = new Set<string>();
  for (const line of content.split(/\r?\n/u)) {
    const hash = /^([0-9a-f]{64})(?:\s|$)/iu.exec(line.trim())?.[1];
    if (hash !== undefined) hashes.add(hash.toLocaleLowerCase());
  }
  return hashes;
}

export function createBlocklistLoader(path: string, warn: (message: string) => void = () => {}): BlocklistLoader {
  let fingerprint: string | undefined;
  let cached: ReadonlySet<string> | null = null;
  let warned = false;

  return {
    async load(): Promise<ReadonlySet<string> | null> {
      try {
        const metadata = await stat(path);
        const nextFingerprint = `${metadata.mtimeMs}:${metadata.ctimeMs}:${metadata.size}`;
        if (nextFingerprint === fingerprint) return cached;
        cached = parseBlocklist(await readFile(path, 'utf8'));
        fingerprint = nextFingerprint;
        warned = false;
        return cached;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        fingerprint = undefined;
        cached = null;
        if (!warned) {
          warn('boundary blocklist unavailable');
          warned = true;
        }
        return null;
      }
    },
  };
}
