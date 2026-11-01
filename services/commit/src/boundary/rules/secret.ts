import { posix } from 'node:path';

import type { BoundaryReason, BoundaryRule } from '../types.js';

const TEXT_EXTENSIONS = new Set(['json', 'ts', 'tsx', 'js', 'jsx', 'md', 'txt', 'env', 'toml', 'yaml', 'yml']);
const TOKEN_PATTERNS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/u,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/u,
  /\baiur_[A-Za-z0-9_-]{32,}/u,
  /\bwhsec_[A-Za-z0-9+/=]{20,}/u,
  /\bsk-[A-Za-z0-9]{20,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /^\s*(?:OGM|AIUR|GITHUB|NETLIFY)_[A-Z0-9_]+=\S+/u,
];
const ENTROPY_TOKEN = /[A-Za-z0-9+/=_-]{32,}/gu;

function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}

function knownHash(line: string, token: string): boolean {
  return /^[0-9a-f]{64}$/iu.test(token) && /["']?sha256["']?\s*[:=]/iu.test(line);
}

function textFile(path: string): boolean {
  return TEXT_EXTENSIONS.has(posix.extname(path).slice(1).toLocaleLowerCase()) || posix.basename(path).startsWith('.env');
}

export const secretRule: BoundaryRule = (input) => {
  const reasons: BoundaryReason[] = [];
  for (const file of input.files) {
    if (file.status === 'removed' || file.content === undefined || !textFile(file.path)) continue;
    const lines = file.content.split(/\r?\n/u);
    lines.forEach((line, index) => {
      const explicit = TOKEN_PATTERNS.some((pattern) => pattern.test(line));
      if (explicit) {
        reasons.push({ code: 'secret', path: file.path, detail: `token-like string at line ${index + 1}` });
        return;
      }
      if (line.includes('data:')) return;
      ENTROPY_TOKEN.lastIndex = 0;
      const tokenLike = [...line.matchAll(ENTROPY_TOKEN)].some(({ 0: token }) => !knownHash(line, token) && entropy(token) > 4.5);
      if (tokenLike) reasons.push({ code: 'secret', path: file.path, detail: `high-entropy string at line ${index + 1}` });
    });
  }
  return reasons;
};
