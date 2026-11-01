import type { AssetCard, MapLayoutSpec } from './card.js';
import { validateCard, validateLayoutSpec } from './card.js';
import { layoutMetrics } from './layout.js';
import { effectiveRights, processingAllowed, rightsAgree, type EffectiveRights } from './rights.js';

export type CheckResult = { file: string; check: string; ok: boolean; message?: string };

type Document = { file: string; doc: unknown };
type ValidDocument =
  { file: string; kind: 'card'; doc: AssetCard } | { file: string; kind: 'layout'; doc: MapLayoutSpec };

function schemaOf(doc: unknown): string | undefined {
  if (typeof doc !== 'object' || doc === null || !('schema' in doc)) return undefined;
  return typeof doc.schema === 'string' ? doc.schema : undefined;
}

function hasLayoutSchema(doc: unknown): boolean {
  return schemaOf(doc)?.startsWith('ogm.map-layout-spec') === true;
}

export function checkDocuments(docs: Document[]): { ok: boolean; results: CheckResult[] } {
  const results: CheckResult[] = [];
  const push = (file: string, check: string, ok: boolean, message?: string): void => {
    results.push(message === undefined ? { file, check, ok } : { file, check, ok, message });
  };

  const validDocs: ValidDocument[] = [];
  for (const { file, doc } of docs) {
    if (hasLayoutSchema(doc)) {
      const validation = validateLayoutSpec(doc);
      push(file, 'schema', validation.ok, validation.ok ? undefined : validation.errors.join('; '));
      if (validation.ok) validDocs.push({ file, kind: 'layout', doc: validation.spec });
    } else {
      const validation = validateCard(doc);
      push(file, 'schema', validation.ok, validation.ok ? undefined : validation.errors.join('; '));
      if (validation.ok) validDocs.push({ file, kind: 'card', doc: validation.card });
    }
  }

  const cardsById = new Map<string, AssetCard>();
  for (const document of validDocs) {
    if (document.kind === 'card') cardsById.set(document.doc.id, document.doc);
  }
  const resolvedRights = (card: AssetCard): NonNullable<AssetCard['rights']> | null => {
    if (card.rights) return card.rights;
    if (!card.collection) return null;
    return cardsById.get(card.collection)?.rights ?? null;
  };

  for (const document of validDocs) {
    if (document.kind === 'card') {
      const { file, doc } = document;
      if (doc.rights) {
        let effective: EffectiveRights;
        try {
          effective = effectiveRights(doc.rights.basis);
        } catch (error) {
          push(file, 'rights=basis', false, error instanceof Error ? error.message : String(error));
          continue;
        }
        push(
          file,
          'rights=basis',
          rightsAgree(doc.rights, effective),
          `effective ${JSON.stringify({ ...effective, uses: [...effective.uses] })}`,
        );
      }

      const provenance = Object.entries(doc.provenance);
      const modelRights = provenance.filter(([key, entry]) => key.startsWith('rights') && entry?.by === 'model');
      push(file, 'no-model-rights', modelRights.length === 0, 'model provenance on rights');

      const modelOutsideAllowlist = provenance.filter(
        ([key, entry]) =>
          entry?.by === 'model' &&
          !(
            key.startsWith('describe') ||
            /^(kit\.(open_edges|connects_to)|vfx\.blend|audio\.ucs_cat_id|map\.map_type|subkind)$/.test(key)
          ),
      );
      push(
        file,
        'model-writes-allowlist',
        modelOutsideAllowlist.length === 0,
        JSON.stringify(modelOutsideAllowlist.map(([key]) => key)),
      );

      if (doc.card_type === 'asset') {
        const rights = resolvedRights(doc);
        if (doc.collection && cardsById.has(doc.collection)) {
          push(file, 'rights-resolvable', rights !== null, 'no rights on card or collection');
        }
        if (doc.kind === 'inspiration') {
          push(
            file,
            'map-not-in-game',
            rights !== null && !rights.uses.includes('in-game') && !rights.uses.includes('placeholder'),
            'inspiration map allows in-game',
          );
        }
      }

      const processing = processingAllowed(doc);
      push(file, 'processing-rule', processing.ok, processing.ok ? undefined : processing.reason);
    } else {
      const { file, doc } = document;
      const sourceCard = cardsById.get(doc.source.card_id) ?? null;
      const rights = sourceCard ? resolvedRights(sourceCard) : null;
      push(
        file,
        'spec-source-allows-derive-layout',
        rights?.uses.includes('derive-layout') === true,
        'source lacks derive-layout',
      );
      push(file, 'spec-linked-from-card', sourceCard?.map?.layout_spec?.id === doc.id, 'card does not link this spec');

      const metrics = layoutMetrics(doc);
      const expected = doc.tags.computed;
      push(file, 'spec-loop-count', metrics.loop_count === expected.loop_count, `computed ${metrics.loop_count}`);
      push(
        file,
        'spec-dead-ends',
        metrics.dead_end_count === expected.dead_end_count,
        `computed ${metrics.dead_end_count}`,
      );
      push(
        file,
        'spec-room-count',
        metrics.room_count === expected.room_count && metrics.connection_count === expected.connection_count,
        '',
      );
      push(
        file,
        'spec-areas',
        metrics.areas_ok && metrics.total_area_cells === expected.total_area_cells,
        `total ${metrics.total_area_cells}`,
      );
      push(file, 'spec-secrets', metrics.secret_count === expected.secret_count, '');
      push(file, 'spec-endpoints-exist', metrics.endpoints_ok, '');
    }
  }

  return { ok: results.every((result) => result.ok), results };
}
