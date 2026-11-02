// Fails when a tracked file names the real host node, tailnet or service account (#317).
// The names are stored as SHA-256 prefixes so this check does not publish them itself.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const forbidden = new Set([
  '607fd88695b1',
  '0cbd3614c1af',
  '964a484c96d2',
]);

const seen = new Map();
const isForbidden = (token) => {
  if (!seen.has(token)) seen.set(token, forbidden.has(createHash('sha256').update(token).digest('hex').slice(0, 12)));
  return seen.get(token);
};
const namesForbidden = (text) => text.toLowerCase().split(/[^a-z0-9]+/).some(isForbidden);

const files = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
const offenders = [];
for (const file of files) {
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    continue;
  }
  if (namesForbidden(`${file}\n${buffer.toString('latin1')}`)) offenders.push(file);
}

if (offenders.length) {
  console.error(
    `Real host, tailnet or account names found; use <tailnet-host>, <user> or $HOME instead:\n  ${offenders.join('\n  ')}`,
  );
  process.exit(1);
}
