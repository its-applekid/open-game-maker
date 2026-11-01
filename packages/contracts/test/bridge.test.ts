import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  envelope,
  gameToHostSchema,
  hostToGameSchema,
  NET_DATA_MAX_CHARS,
  patchSchema,
  SDK_PROTOCOL,
} from '../src/bridge.js';
import { loadJson } from './helpers.js';
import { emittedValidator } from './json-schema.js';

const bridgeJson = emittedValidator('bridge.v1');

function issuePaths(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => issue.path.join('.'));
}

describe('bridge contract', () => {
  it('pins the wire protocol to 1', () => {
    expect(SDK_PROTOCOL).toBe(1);
  });

  it.each([
    ['bridge.v1.json', hostToGameSchema],
    ['bridge-design-apply.v1.json', hostToGameSchema],
    ['bridge-net-snapshot.v1.json', hostToGameSchema],
    ['bridge-ready.v1.json', gameToHostSchema],
    ['bridge-net-snapshot.v1.json', gameToHostSchema],
  ] as const)('accepts %s in both Zod and the emitted JSON Schema', (file, schema) => {
    const doc = loadJson(`fixtures/${file}`);
    expect(schema.safeParse(doc).success).toBe(true);
    expect(bridgeJson(doc)).toBe(true);
  });

  it('carries the hello tier the host picked', () => {
    const hello = hostToGameSchema.parse(loadJson('fixtures/bridge.v1.json'));
    expect(hello.t === 'hello' && hello.payload.tier).toBe('mobile');
  });

  // T07 §4.3 replaced T04's mp.* spelling with net.*; mp.* must stay unknown in both directions.
  it.each([hostToGameSchema, gameToHostSchema])('rejects the retired mp.snapshot type at t', (schema) => {
    const doc = loadJson('fixtures/negative/bridge-unknown-t.v1.json');
    expect(issuePaths(schema, doc)).toEqual(['t']);
    expect(bridgeJson(doc)).toBe(false);
  });

  it('rejects an envelope whose v is not 1', () => {
    const doc = loadJson('fixtures/negative/bridge-wrong-v.v1.json');
    expect(issuePaths(hostToGameSchema, doc)).toEqual(['v']);
    expect(bridgeJson(doc)).toBe(false);
  });

  it('rejects a net.snapshot over the 64 KiB base64 cap at payload.data', () => {
    const doc = loadJson<{ payload: { data: string } }>('fixtures/negative/bridge-over-cap.v1.json');
    expect(doc.payload.data.length).toBeGreaterThan(NET_DATA_MAX_CHARS);
    expect(issuePaths(hostToGameSchema, doc)).toEqual(['payload.data']);
    expect(issuePaths(gameToHostSchema, doc)).toEqual(['payload.data']);
    expect(bridgeJson(doc)).toBe(false);
  });

  it('keeps direction: a game cannot send design.apply and a host cannot send ready', () => {
    expect(gameToHostSchema.safeParse(loadJson('fixtures/bridge-design-apply.v1.json')).success).toBe(false);
    expect(hostToGameSchema.safeParse(loadJson('fixtures/bridge-ready.v1.json')).success).toBe(false);
  });

  it('rejects patch ops outside the T08 subset', () => {
    const doc = loadJson<{ payload: { patches: { op: string }[] } }>('fixtures/bridge-design-apply.v1.json');
    doc.payload.patches[0]!.op = 'move';
    expect(issuePaths(hostToGameSchema, doc)).toEqual(['payload.patches.0.op']);
    expect(patchSchema.safeParse({ op: 'add', path: ['a', 1], value: 2 }).success).toBe(true);
  });

  it('is strict on the envelope and loose on payloads', () => {
    const hello = loadJson<Record<string, unknown> & { payload: Record<string, unknown> }>('fixtures/bridge.v1.json');
    expect(hostToGameSchema.safeParse({ ...hello, extra: 1 }).success).toBe(false);
    const future = { ...hello, payload: { ...hello.payload, futureField: true } };
    expect(hostToGameSchema.parse(future).payload).toHaveProperty('futureField', true);
    expect(bridgeJson(future)).toBe(true);
  });

  it('caps message ids at 64 characters', () => {
    const hello = loadJson<Record<string, unknown>>('fixtures/bridge.v1.json');
    expect(issuePaths(hostToGameSchema, { ...hello, id: 'x'.repeat(65) })).toEqual(['id']);
    expect(issuePaths(hostToGameSchema, { ...hello, id: '' })).toEqual(['id']);
    expect(issuePaths(hostToGameSchema, { ...hello, replyTo: 'x'.repeat(65) })).toEqual(['replyTo']);
  });

  it('forbids text in a relayed input frame', () => {
    const frame = { seq: 1, tick: 2, axes: [0.5], buttons: 3 };
    const message = { v: 1, id: 'n1', t: 'net.input', payload: { f: frame } };
    expect(gameToHostSchema.safeParse(message).success).toBe(true);
    expect(issuePaths(gameToHostSchema, { ...message, payload: { f: { ...frame, text: 'hi' } } })).toEqual([
      'payload.f.text',
    ]);
    // host → game frames carry the server-stamped playerIndex
    expect(issuePaths(hostToGameSchema, message)).toEqual(['payload.f.playerIndex']);
  });

  it('builds envelopes with a literal type', () => {
    const ping = envelope('custom.ping', patchSchema.pick({ op: true }));
    expect(ping.safeParse({ v: 1, id: 'p', t: 'custom.ping', payload: { op: 'add' } }).success).toBe(true);
    expect(ping.safeParse({ v: 1, id: 'p', t: 'custom.pong', payload: { op: 'add' } }).success).toBe(false);
  });
});
