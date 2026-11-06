import { createHmac, randomBytes } from 'node:crypto';

import type { VoiceTarget } from '@ogm/contracts';

// Same format as voice_converse's `VoiceConverse.TokenIssuer.Hmac`, which the voice host verifies:
// `vct1.` + base64url(JSON{scope, sub, exp, nonce, target}) + `.` + base64url(HMAC-SHA256(secret, body)).
export const VOICE_TOKEN_SCOPE = 'converse';
export const VOICE_DICTATION_TOKEN_SCOPE = 'dictate';
export const VOICE_TOKEN_TTL_SEC = 300;
export const VOICE_TOKEN_MIN_SECRET_BYTES = 32;

export function mintVoiceToken(input: {
  secret: string;
  sub: string;
  target: VoiceTarget;
  nowMs?: number;
  ttlSec?: number;
  scope?: string;
  nonce?: string;
}): { token: string; exp: number } {
  if (Buffer.byteLength(input.secret) < VOICE_TOKEN_MIN_SECRET_BYTES) {
    throw new Error(`voice token secret must be at least ${VOICE_TOKEN_MIN_SECRET_BYTES} bytes`);
  }
  const exp = Math.floor((input.nowMs ?? Date.now()) / 1000) + (input.ttlSec ?? VOICE_TOKEN_TTL_SEC);
  const payload = {
    scope: input.scope ?? VOICE_TOKEN_SCOPE,
    sub: input.sub,
    exp,
    nonce: input.nonce ?? randomBytes(12).toString('base64url'),
    target: input.target,
  };
  const body = `vct1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const mac = createHmac('sha256', input.secret).update(body).digest('base64url');
  return { token: `${body}.${mac}`, exp };
}
