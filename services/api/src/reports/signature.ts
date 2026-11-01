import { createHash } from 'node:crypto';

import type { ReportError, ReportFrame } from '@ogm/contracts';

export type SignatureScope = 'game' | 'platform';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function normaliseMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, '#')
    .replace(/[0-9]+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

// `https://games.example/g/<gameId>/<buildId>/systems/combat.js` -> `systems/combat.js`.
export function frameFile(file: string): string {
  return file.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').replace(/^\/g\/[^/]+\/[^/]+\//, '');
}

export function frameKey(frame: ReportFrame): string {
  return `${frameFile(frame.file)}:${frame.fn?.toLowerCase() ?? '?'}`;
}

export function signatureText(input: { error: ReportError; gameId: string; scope: SignatureScope }): string {
  const parts = [
    input.error.type.toLowerCase(),
    normaliseMessage(input.error.message),
    input.error.frames.slice(0, 3).map(frameKey).join(','),
  ];
  if (input.scope === 'game') parts.push(input.gameId);
  return parts.join('|');
}

// hash(error type, normalised message, top frames, gameId); gameId omitted for platform signatures.
export function signature(input: { error: ReportError; gameId: string; scope: SignatureScope }): string {
  return sha256(signatureText(input));
}

// Reports without an error group by (game, release, normalised text) and never merge across games.
export function textSignature(input: { gameId: string; releaseId?: string; text?: string }): string {
  return sha256(['text', input.gameId, input.releaseId ?? '', normaliseMessage(input.text ?? '')].join('|'));
}
