import { controlDeclSchema, gameManifestSchema } from '@ogm/contracts/game';

import type { Check } from '../types.js';
import { fail, pass } from './util.js';

function duplicates(ids: string[]): string[] {
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

/** A4 §10.3 (1): the manifest is valid and its ids are unique. */
export const c01Manifest: Check = {
  id: 'C1',
  name: 'manifest-valid',
  async run({ game }) {
    const manifest = gameManifestSchema.safeParse(game.manifest);
    if (!manifest.success) return fail(`manifest invalid: ${manifest.error.issues[0]?.message ?? 'unknown'}`);
    const badControl = game.controls.find((control) => !controlDeclSchema.safeParse(control).success);
    if (badControl) return fail(`control ${badControl.id} does not match the control schema`);
    const problems = [
      ...duplicates(game.controls.map((control) => control.id)).map((id) => `duplicate control id ${id}`),
      ...duplicates(game.manifest.palette.items.map((item) => item.prefab)).map((id) => `duplicate palette ${id}`),
      ...duplicates(game.manifest.palette.categories.map((category) => category.id)).map(
        (id) => `duplicate category ${id}`,
      ),
    ];
    const categories = new Set(game.manifest.palette.categories.map((category) => category.id));
    for (const item of game.manifest.palette.items) {
      if (!categories.has(item.category))
        problems.push(`palette ${item.prefab} names unknown category ${item.category}`);
    }
    if (problems.length > 0) return fail(problems.join('; '));
    return pass(`${game.controls.length} controls, ${game.manifest.palette.items.length} palette items, ids unique`);
  },
};
