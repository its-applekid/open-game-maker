import { randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { licenseFor } from '@ogm/asset-cards';
import { effectiveRights, validateCard, type AssetCard, type RightsBasis } from '@ogm/contracts';

export type ConfirmOptions = {
  assetsRoot: string;
  collectionId: string;
  license: string;
  confirmedBy: string;
  note?: string;
  decision?: string;
};

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

function collectionParts(id: string): { packId: string; version: string } {
  const match = /^t1:([a-z0-9][a-z0-9-]*)@([A-Za-z0-9._-]+)$/.exec(id);
  if (!match) throw new Error(`invalid collection id ${JSON.stringify(id)}`);
  return { packId: match[1], version: match[2] };
}

async function findPack(assetsRoot: string, id: string): Promise<string> {
  const { packId } = collectionParts(id);
  for (const top of ['packs', 'inspiration']) {
    const path = join(assetsRoot, top, packId, 'collection.card.json');
    try {
      const card = JSON.parse(await readFile(path, 'utf8')) as AssetCard;
      if (card.id === id) return dirname(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`collection not found: ${id}`);
}

function parseDecision(value: string, date: string, name: string): RightsBasis {
  const fields = Object.fromEntries(
    value.split(';').map((part) => {
      const split = part.indexOf('=');
      return [part.slice(0, split).trim(), part.slice(split + 1).trim()];
    }),
  );
  const uses = (fields.uses ?? '')
    .split(',')
    .map((use) => use.trim())
    .filter(Boolean) as RightsBasis['uses'];
  if (!fields.audience || !fields.redistribution || uses.length === 0)
    throw new Error('decision requires uses, audience, and redistribution');
  return {
    type: 'decision',
    uses,
    audience: fields.audience as RightsBasis['audience'],
    redistribution: fields.redistribution as RightsBasis['redistribution'],
    set_by: { role: 'admin', name },
    date,
    ...(fields.note ? { note: fields.note } : {}),
  };
}

export async function confirmCollection(
  options: ConfirmOptions,
): Promise<{ collection: string; status: 'imported'; license: string }> {
  const row = licenseFor(options.license);
  if (!row) throw new Error(`unknown license ${JSON.stringify(options.license)}`);
  if (!options.confirmedBy.trim()) throw new Error('--confirmed-by must name the human who confirmed the license');
  const packRoot = await findPack(options.assetsRoot, options.collectionId);
  const path = join(packRoot, 'collection.card.json');
  const card = JSON.parse(await readFile(path, 'utf8')) as AssetCard;
  const date = new Date().toISOString().slice(0, 10);
  const licenseBasis: RightsBasis = {
    type: 'license',
    license: row.id,
    ref: row.ref,
    uses: [...row.ceiling.uses],
    audience: row.ceiling.audience,
    redistribution: row.ceiling.redistribution,
    attribution: row.ceiling.attribution,
    ...(row.ceiling.forbids ? { forbids: [...row.ceiling.forbids] } : {}),
    set_by: { role: 'intake-code' },
    confirmed_by: options.confirmedBy,
    date,
    note: options.note ?? row.note,
  };
  const basis = [
    licenseBasis,
    ...(options.decision ? [parseDecision(options.decision, date, options.confirmedBy)] : []),
  ] as [RightsBasis, ...RightsBasis[]];
  const effective = effectiveRights(basis);
  card.license = row.id;
  card.status = 'draft';
  card.rights = {
    uses: [...effective.uses],
    audience: effective.audience,
    redistribution: effective.redistribution,
    attribution: row.ceiling.attribution,
    processing: row.processing,
    basis,
  };
  const validation = validateCard(card);
  if (!validation.ok) throw new Error(`confirmed collection card is invalid: ${validation.errors.join('; ')}`);
  await atomicJson(path, card);

  const packPath = join(packRoot, 'pack.json');
  const pack = JSON.parse(await readFile(packPath, 'utf8')) as {
    license?: string;
    license_source?: string;
    source?: { intake_path?: string };
  };
  pack.license = row.id;
  pack.license_source = row.ref;
  await atomicJson(packPath, pack);
  if (pack.source?.intake_path) {
    const intakePath = join(options.assetsRoot, ...pack.source.intake_path.split('/'));
    await atomicJson(intakePath, {
      status: 'imported',
      collection: card.id,
      license: row.id,
      rights: card.rights,
      confirmed_by: options.confirmedBy,
      date,
    });
  }
  return { collection: card.id, status: 'imported', license: row.id };
}
