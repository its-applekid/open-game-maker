import { homedir } from 'node:os';

export type EnvKind = 'string' | 'secret' | 'port' | 'url' | 'path' | 'int' | 'bool';

export type ParsedEnvValue = string | number | boolean;

export type ParseResult =
  { readonly ok: true; readonly value: ParsedEnvValue } | { readonly ok: false; readonly reason: string };

function valid(value: ParsedEnvValue): ParseResult {
  return { ok: true, value };
}

function invalid(reason: string): ParseResult {
  return { ok: false, reason };
}

export function parseKind(kind: EnvKind, raw: string): ParseResult {
  switch (kind) {
    case 'string':
      return raw.length > 0 ? valid(raw) : invalid('string: empty');
    case 'secret':
      return raw.length >= 16 ? valid(raw) : invalid('secret: shorter than 16 characters');
    case 'port': {
      if (!/^[0-9]+$/.test(raw)) return invalid('port: not an integer');
      const value = Number(raw);
      return value >= 1 && value <= 65_535 ? valid(value) : invalid('port: outside 1-65535');
    }
    case 'int':
      return /^-?[0-9]+$/.test(raw) && Number.isSafeInteger(Number(raw))
        ? valid(Number(raw))
        : invalid('int: not an integer');
    case 'bool':
      if (raw === 'true' || raw === '1') return valid(true);
      if (raw === 'false' || raw === '0') return valid(false);
      return invalid('bool: expected true, false, 1, or 0');
    case 'url':
      try {
        const value = new URL(raw);
        return value.protocol === 'http:' || value.protocol === 'https:'
          ? valid(raw)
          : invalid('url: expected http or https');
      } catch {
        return invalid('url: malformed');
      }
    case 'path':
      if (raw.length === 0) return invalid('path: empty');
      if (raw === '~') return valid(homedir());
      return raw.startsWith('~/') ? valid(`${homedir()}/${raw.slice(2)}`) : valid(raw);
  }
}
