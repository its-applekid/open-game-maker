import type { ControlDecl, DesignDoc, EditorCommand, Patch } from '@ogm/contracts';

import { canonical } from './canonical.js';

export const MAX_PATCH_BYTES = 256 * 1024;

export type ValidationError = { path: string; code: string };
export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };
export type ValueValidationResult = { ok: true } | { ok: false; reason: 'type' | 'range' | 'option' };

export class PatchTooLargeError extends RangeError {
  readonly bytes: number;

  constructor(bytes: number) {
    super(`patches are ${bytes} bytes; maximum is ${MAX_PATCH_BYTES}`);
    this.name = 'PatchTooLargeError';
    this.bytes = bytes;
  }
}

function validStep(value: number, minimum: number, step: number | undefined): boolean {
  if (step === undefined) return true;
  const units = (value - minimum) / step;
  return Math.abs(units - Math.round(units)) < 1e-9;
}

export function validateValue(control: ControlDecl, value: unknown): ValueValidationResult {
  const widget = control.widget;
  switch (widget.kind) {
    case 'slider':
      if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, reason: 'type' };
      if (value < widget.min || value > widget.max || !validStep(value, widget.min, widget.step)) {
        return { ok: false, reason: 'range' };
      }
      return { ok: true };
    case 'count':
      if (typeof value !== 'number' || !Number.isInteger(value)) return { ok: false, reason: 'type' };
      return value < widget.min || value > widget.max ? { ok: false, reason: 'range' } : { ok: true };
    case 'toggle':
      return typeof value === 'boolean' ? { ok: true } : { ok: false, reason: 'type' };
    case 'choice':
      if (typeof value !== 'string') return { ok: false, reason: 'type' };
      return widget.options.some((option) => option.value === value) ? { ok: true } : { ok: false, reason: 'option' };
    case 'color':
      if (typeof value !== 'string') return { ok: false, reason: 'type' };
      return widget.palette === undefined || widget.palette.includes(value)
        ? { ok: true }
        : { ok: false, reason: 'option' };
    case 'text':
      if (typeof value !== 'string') return { ok: false, reason: 'type' };
      return value.length <= widget.maxLength ? { ok: true } : { ok: false, reason: 'range' };
    default:
      return { ok: true };
  }
}

export function validateCommands(
  controls: readonly ControlDecl[],
  doc: DesignDoc,
  commands: readonly EditorCommand[],
): ValidationResult {
  const byId = new Map(controls.map((control) => [control.id, control]));
  const errors: ValidationError[] = [];

  commands.forEach((command, commandIndex) => {
    if (command.op === 'invoke') return;
    const control = byId.get(command.control);
    if (control === undefined) {
      errors.push({ path: `commands.${commandIndex}.control`, code: 'control_unknown' });
      return;
    }
    if (command.targets === 'global') {
      if (control.scope !== 'global') errors.push({ path: `commands.${commandIndex}.targets`, code: 'scope' });
    } else {
      if (control.scope === 'global') errors.push({ path: `commands.${commandIndex}.targets`, code: 'scope' });
      command.targets.forEach((target, targetIndex) => {
        if (doc.entities[target] === undefined) {
          errors.push({ path: `commands.${commandIndex}.targets.${targetIndex}`, code: 'target_unknown' });
        }
      });
    }
    if (command.op === 'set') {
      const result = validateValue(control, command.value);
      if (!result.ok) errors.push({ path: `commands.${commandIndex}.value`, code: `value_${result.reason}` });
    }
  });

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validatePatches(patches: readonly Patch[]): ValidationResult {
  const bytes = Buffer.byteLength(canonical(patches));
  if (bytes > MAX_PATCH_BYTES) throw new PatchTooLargeError(bytes);

  const errors: ValidationError[] = [];
  patches.forEach((patch, index) => {
    const path = patch.path;
    const errorPath = `patches.${index}.path`;
    if ((patch.op === 'add' || patch.op === 'replace') && !Object.hasOwn(patch, 'value')) {
      errors.push({ path: `patches.${index}.value`, code: 'value_required' });
      return;
    }
    if (!Array.isArray(path) || (path[0] !== 'globals' && path[0] !== 'entities')) {
      errors.push({ path: errorPath, code: 'path_root' });
      return;
    }
    if (path[0] === 'entities') {
      if (typeof path[1] === 'number' || (path.length === 1 && Array.isArray(patch.value))) {
        errors.push({ path: errorPath, code: 'array_entities' });
        return;
      }
    }
    if (path.length === 1 && (patch.op === 'remove' || !isRecord(patch.value))) {
      errors.push({ path: errorPath, code: 'required_root' });
    }
  });
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
