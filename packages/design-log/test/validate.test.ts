import { describe, expect, it } from 'vitest';

import type { ControlDecl, Patch } from '@ogm/contracts';

import { InvalidPatchError, apply } from '../src/apply.js';
import { PatchTooLargeError, validateCommands, validatePatches, validateValue } from '../src/validate.js';
import { baseDoc, ids } from './helpers.js';

const slider: ControlDecl = {
  id: 'world.gravity',
  label: 'Gravity',
  scope: 'global',
  path: '/gravity',
  widget: { kind: 'slider', min: 0, max: 10, step: 0.5 },
  default: 9.8,
};

const toggle: ControlDecl = {
  id: 'door.locked',
  label: 'Locked',
  scope: 'instance',
  path: '/locked',
  widget: { kind: 'toggle' },
  default: false,
};

describe('validateValue', () => {
  it('checks primitive type, range, step, and declared options', () => {
    expect(validateValue(slider, 15)).toEqual({ ok: false, reason: 'range' });
    expect(validateValue(slider, 1.25)).toEqual({ ok: false, reason: 'range' });
    expect(validateValue(slider, 1.5)).toEqual({ ok: true });
    expect(validateValue(toggle, 'yes')).toEqual({ ok: false, reason: 'type' });
    expect(
      validateValue({ ...toggle, widget: { kind: 'choice', options: [{ value: 'blue', label: 'Blue' }] } }, 'red'),
    ).toEqual({ ok: false, reason: 'option' });
  });
});

describe('validateCommands', () => {
  it('accepts known controls with compatible scope, target, and value', () => {
    expect(
      validateCommands([slider, toggle], baseDoc(), [
        { op: 'set', control: 'world.gravity', targets: 'global', value: 9.5 },
        { op: 'set', control: 'door.locked', targets: [ids.entity], value: true },
      ]),
    ).toEqual({ ok: true });
  });

  it('reports unknown controls, bad scopes, missing targets, and invalid values', () => {
    const result = validateCommands([slider, toggle], baseDoc(), [
      { op: 'set', control: 'missing.control', targets: 'global', value: true },
      { op: 'set', control: 'door.locked', targets: 'global', value: true },
      { op: 'set', control: 'door.locked', targets: ['e_01BX5ZZKBKACTAV9WEVGEMMVRZ'], value: true },
      { op: 'set', control: 'door.locked', targets: [ids.entity], value: 'yes' },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        { path: 'commands.0.control', code: 'control_unknown' },
        { path: 'commands.1.targets', code: 'scope' },
        { path: 'commands.2.targets.0', code: 'target_unknown' },
        { path: 'commands.3.value', code: 'value_type' },
      ],
    });
  });
});

describe('validatePatches', () => {
  it.each([
    [[{ op: 'replace', path: ['entities', 0, 'props'], value: {} }], 'array_entities'],
    [[{ op: 'replace', path: ['secrets', 'token'], value: 'x' }], 'path_root'],
    [[{ op: 'replace', path: ['entities'], value: [] }], 'array_entities'],
  ] as const)('rejects invalid patches with code %s', (patches, code) => {
    expect(validatePatches(patches as unknown as Patch[])).toEqual({
      ok: false,
      errors: [{ path: 'patches.0.path', code }],
    });
  });

  it.each([
    [[{ op: 'remove', path: ['entities'] }], 'patches.0.path', 'required_root'],
    [[{ op: 'replace', path: ['globals'], value: [] }], 'patches.0.path', 'required_root'],
    [[{ op: 'replace', path: ['globals', 'gravity'] }], 'patches.0.value', 'value_required'],
  ] as const)('rejects patches that would invalidate a required root', (patches, path, code) => {
    expect(validatePatches(patches as unknown as Patch[])).toEqual({
      ok: false,
      errors: [{ path, code }],
    });
  });

  // JSON.parse keeps `__proto__` as an own key, as a decoded request body would.
  it.each([
    ['{"op":"replace","path":["globals","__proto__"],"value":1}', 'patches.0.path'],
    ['{"op":"replace","path":["entities","constructor"],"value":{}}', 'patches.0.path'],
    ['{"op":"replace","path":["globals","door"],"value":[[{"__proto__":{}}]]}', 'patches.0.value'],
    ['{"op":"add","path":["globals","door"],"value":{"a":{"__proto__":1}}}', 'patches.0.value'],
  ])('rejects reserved prototype keys in %s', (patch, path) => {
    expect(validatePatches([JSON.parse(patch) as Patch])).toEqual({
      ok: false,
      errors: [{ path, code: 'reserved_key' }],
    });
  });

  it('keeps constructor and prototype as ordinary value fields', () => {
    const value = { constructor: 1, nested: [{ prototype: null }] };
    expect(validatePatches([{ op: 'add', path: ['globals', 'door'], value }])).toEqual({ ok: true });
    expect(apply(baseDoc(), [{ op: 'add', path: ['globals', 'door'], value }]).globals.door).toEqual(value);
  });

  it('throws a typed error above the 256 KiB canonical cap', () => {
    expect(() => validatePatches([{ op: 'add', path: ['globals', 'large'], value: 'x'.repeat(300 * 1024) }])).toThrow(
      PatchTooLargeError,
    );
  });

  it('guards apply itself from invalid roots', () => {
    expect(() => apply(baseDoc(), [{ op: 'add', path: ['secrets', 'token'], value: 'x' }])).toThrow(InvalidPatchError);
    expect(() => apply(baseDoc(), [{ op: 'remove', path: ['entities'] }])).toThrow(InvalidPatchError);
    expect(() => apply(baseDoc(), [{ op: 'replace', path: ['globals', 'gravity'] }])).toThrow(InvalidPatchError);
    // Without the guard, immer's clone turns the own `__proto__` key into the object's prototype.
    const polluted = JSON.parse('{"op":"replace","path":["globals","door"],"value":[{"__proto__":{}}]}') as Patch;
    expect(() => apply(baseDoc(), [polluted])).toThrow(InvalidPatchError);
  });
});
