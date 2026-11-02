import { firstDifference } from '../json.js';
import type { Check } from '../types.js';
import { fail, message, pass, unchecked, withSession } from './util.js';

type Entity = { id: string; prefab: string; props?: Record<string, unknown> };

function position(entity: Entity | undefined): [number, number, number] {
  const coord = (key: string) => (typeof entity?.props?.[key] === 'number' ? (entity.props[key] as number) : 0);
  return [coord('x'), coord('y'), coord('z')];
}

/**
 * B7 §2: every palette item round-trips through undo. Each item answers `editor.validatePlacement`,
 * and adding one (a copy of an existing entity, host-minted id) then applying the original design
 * leaves `renderGameToText` byte-equal. Tools are checked statically; the apply-tool-then-undo
 * round trip waits for the editor tool protocol (OGM-075).
 */
export const c11Palette: Check = {
  id: 'C11',
  name: 'palette-undo',
  async run(ctx) {
    const { design, manifest } = ctx.game;
    const items = manifest.palette.items;
    if (items.length === 0) return unchecked('the palette has no items');
    const entities = Object.values((design.entities ?? {}) as Record<string, Entity>);
    if (entities.length === 0) return fail('design has no entity to model a palette placement on');
    return withSession(ctx, {}, async (session) => {
      const baseline = await session.text();
      for (const [index, item] of items.entries()) {
        const model = entities.find((entity) => entity.prefab === item.prefab) ?? entities[0]!;
        const placement = await session.validatePlacement(item.prefab, position(model));
        if (!placement) return fail(`palette ${item.prefab}: no placement answer`);
        const id = `${item.prefab}_conf${index}`;
        const added = structuredClone(design);
        const entity = { ...structuredClone(model), id, prefab: item.prefab };
        (added.entities as Record<string, Entity>)[id] = entity;
        try {
          await session.applyDesign(added, [{ op: 'add', path: ['entities', id], value: entity }]);
          await session.applyDesign(design, [{ op: 'remove', path: ['entities', id] }]);
        } catch (error) {
          return fail(`palette ${item.prefab}: ${message(error)}`);
        }
        const diff = firstDifference(await session.text(), baseline);
        if (diff !== null) return fail(`palette ${item.prefab}: undo left ${diff} changed`);
      }
      return pass(
        `${items.length} palette items placed and undone byte-equal; tools ${manifest.tools.join(', ')} checked statically (dynamic undo waits for OGM-075)`,
      );
    });
  },
};
