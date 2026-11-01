import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { decode, encode } from '../src/wire.js';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/voice-converse.v1.json', import.meta.url), 'utf8'),
) as Array<Record<string, unknown>>;
const schema = JSON.parse(
  readFileSync(new URL('../schemas/voice-converse.v1.schema.json', import.meta.url), 'utf8'),
) as object;

describe('voice wire contract', () => {
  it('round-trips every vendored frame without dropping unknown fields', () => {
    for (const frame of fixture) {
      const withUnknown = { ...frame, future_field: { kept: true } };
      expect(JSON.parse(encode(decode(JSON.stringify(withUnknown))))).toEqual(withUnknown);
    }
  });

  it('validates every fixture frame against the vendored schema', () => {
    const validate = new Ajv2020({ strict: false }).compile(schema);
    for (const frame of fixture) expect(validate(frame), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects unsupported versions, unknown types, invalid JSON, and oversized frames', () => {
    expect(() => decode('{"v":2,"type":"state"}')).toThrow('unsupported_version');
    expect(() => decode('{"v":1,"type":"nope"}')).toThrow('invalid_frame');
    expect(() => decode('{')).toThrow('invalid_frame');
    expect(() => encode({ type: 'text', text: 'x'.repeat(400_000) })).toThrow('frame_too_large');
  });
});
