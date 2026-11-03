import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Hono } from 'hono';
import { z } from 'zod';

import { creditsDocumentSchema, mergeCreditsDocuments, type CreditsDocument } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { and, eq } from 'drizzle-orm';

import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings } from '../app/types.js';
import { parseQuery } from '../app/validate.js';

export const prefix = '/api/v1';

const segment = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const querySchema = z
  .object({ gameId: segment.optional(), buildId: segment.optional() })
  .strict()
  .refine((query) => (query.gameId === undefined) === (query.buildId === undefined), {
    message: 'gameId and buildId must be provided together',
  });

async function readCredits(artifactPath: string): Promise<CreditsDocument> {
  try {
    return creditsDocumentSchema.parse(JSON.parse(await readFile(join(artifactPath, 'credits.json'), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(409, 'credits_unavailable');
    throw error;
  }
}

const routes = new Hono<ApiBindings>().get('/credits', async (c) => {
  const principal = requirePrincipal(c, ['user']);
  const query = parseQuery(c, querySchema);
  const db = c.get('deps').db;
  const common = db
    .select({ artifactPath: schema.builds.artifactPath })
    .from(schema.games)
    .innerJoin(schema.builds, eq(schema.builds.gameId, schema.games.id));

  const rows =
    query.gameId !== undefined && query.buildId !== undefined
      ? common
          .where(
            and(
              eq(schema.games.familyId, principal.familyId),
              eq(schema.games.id, query.gameId),
              eq(schema.builds.id, query.buildId),
              eq(schema.builds.status, 'tested'),
              eq(schema.builds.artifact, 'present'),
            ),
          )
          .all()
      : common
          .innerJoin(
            schema.branches,
            and(
              eq(schema.branches.gameId, schema.games.id),
              eq(schema.branches.name, 'main'),
              eq(schema.branches.latestBuildId, schema.builds.id),
            ),
          )
          .where(
            and(
              eq(schema.games.familyId, principal.familyId),
              eq(schema.builds.status, 'tested'),
              eq(schema.builds.artifact, 'present'),
            ),
          )
          .all();

  if (query.gameId !== undefined && rows.length === 0) throw new HttpError(404, 'credits_not_found');
  return c.json(mergeCreditsDocuments(await Promise.all(rows.map(({ artifactPath }) => readCredits(artifactPath)))));
});

export default routes;
