import { createHmac, timingSafeEqual } from 'node:crypto';

export type AgeCookie = { band: 'adult'; attestedAt: string; exp: number };

export const AGE_COOKIE = 'ogm_age';
export const AGE_REFUSED = 'refused';
export const AGE_COOKIE_TTL_SEC = 24 * 60 * 60;
export const AGE_REFUSED_TTL_SEC = 365 * 24 * 60 * 60;

// Adult once the 18th birthday month is reached (month and year only are collected).
export function isAdult(birthMonth: number, birthYear: number, now: Date): boolean {
  return now.getUTCFullYear() * 12 + now.getUTCMonth() >= (birthYear + 18) * 12 + (birthMonth - 1);
}

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

// base64url(json) + '.' + base64url(hmac-sha256(secret, base64url(json)))
export function signAgeCookie(cookie: AgeCookie, secret: string): string {
  const body = Buffer.from(JSON.stringify(cookie)).toString('base64url');
  return `${body}.${mac(secret, body).toString('base64url')}`;
}

export function verifyAgeCookie(value: string | undefined, secret: string, nowMs = Date.now()): AgeCookie | null {
  const parts = (value ?? '').split('.');
  if (parts.length !== 2) return null;

  const expected = mac(secret, parts[0]);
  const given = Buffer.from(parts[1], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const raw = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<AgeCookie>;
    if (raw.band !== 'adult' || typeof raw.attestedAt !== 'string' || typeof raw.exp !== 'number') return null;
    if (raw.exp * 1000 <= nowMs) return null;
    return { band: raw.band, attestedAt: raw.attestedAt, exp: raw.exp };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}
