import type { Patch } from '@ogm/contracts/bridge';
import type { ControlDecl } from '@ogm/contracts/game';

import { firstDifference, setPointer } from '../json.js';
import type { Check, CheckContext } from '../types.js';
import { controlTargets, fail, message, pass, unchecked, withSession } from './util.js';

/** The far end of each control's range, so a fold exercises every control at once. */
function extreme(control: ControlDecl): unknown {
  const widget = control.widget;
  if (widget.kind === 'slider' || widget.kind === 'count') return widget.max;
  if (widget.kind === 'toggle') return !control.default;
  if (widget.kind === 'choice') return widget.options.at(-1)?.value;
  return control.default;
}

/** Every previous control id still resolves: kept, aliased to a current id, or retired. */
export function missingHints(previousIds: string[], ctx: Pick<CheckContext, 'game'>): string[] {
  const current = new Set(ctx.game.controls.map((control) => control.id));
  const { aliases, retired } = ctx.game.manifest.overrides;
  return previousIds.filter((id) => {
    if (current.has(id) || retired.includes(id)) return false;
    const alias = aliases[id];
    return alias === undefined || !current.has(alias);
  });
}

/**
 * A4 §10.3 (9): override hints are present. Previous control ids survive (or carry an alias or a
 * retirement), `overrides.migrate` names a `migrateOverride`, and a fold of every control at its
 * extreme applies to the same `renderGameToText` in two sessions (E04 §6 risk 6).
 */
export const c09Hints: Check = {
  id: 'C9',
  name: 'override-hints',
  async run(ctx) {
    const { controls, design, manifest } = ctx.game;
    const missing = ctx.previous ? missingHints(ctx.previous.controlIds, ctx) : [];
    if (missing.length > 0) return fail(`previous control ${missing.join(', ')} has no alias or retirement`);
    const unknownMigrate = (manifest.overrides.migrate ?? []).filter((id) => !controls.some((c) => c.id === id));
    if (unknownMigrate.length > 0) return fail(`overrides.migrate names unknown control ${unknownMigrate.join(', ')}`);
    if ((manifest.overrides.migrate ?? []).length > 0 && !ctx.game.hasMigrateOverride) {
      return fail('overrides.migrate is set but the module has no migrateOverride');
    }

    let folded = design;
    const patches: Patch[] = [];
    for (const control of controls) {
      for (const pointer of controlTargets(control, design)) {
        const next = setPointer(folded, pointer, extreme(control));
        folded = next.doc;
        patches.push(next.patch);
      }
    }
    const texts = [];
    for (let run = 0; run < 2; run += 1) {
      try {
        texts.push(
          await withSession(ctx, {}, async (session) => {
            await session.applyDesign(folded, patches);
            await session.advanceTime(500);
            return session.text();
          }),
        );
      } catch (error) {
        return fail(`folded overrides failed to apply: ${message(error)}`);
      }
    }
    const diff = firstDifference(texts[0], texts[1]);
    if (diff !== null) return fail(`folded overrides diverged across two sessions at ${diff}`);
    const fold = `${patches.length} folded overrides apply deterministically`;
    if (!ctx.previous) return unchecked(`no previous build: control id continuity not checked; ${fold}`);
    return pass(`${ctx.previous.controlIds.length} previous control ids resolve; ${fold}`);
  },
};
