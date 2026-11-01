import { Hono } from 'hono';
import { z } from 'zod';

import { Id } from '@ogm/contracts';

import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings } from '../app/types.js';
import { parseBody, parseQuery } from '../app/validate.js';
import { ingestAnalytics } from './ingest.js';
import { buildRollup, RollupQuery } from './rollup.js';
import { buildTimeline } from './timeline.js';

const IngestEnvelope = z.object({ events: z.array(z.unknown()).min(1).max(500) }).strict();

const routes = new Hono<ApiBindings>();

routes.post('/events', async (c) => {
  const principal = requirePrincipal(c, ['job', 'user']);
  const { events } = await parseBody(c, IngestEnvelope);
  const deps = c.get('deps');
  const response = await ingestAnalytics({
    db: deps.db,
    registry: deps.registry,
    principal,
    events,
    log: deps.log,
  });
  return c.json(response, 202);
});

routes.get('/builds/:jobId/timeline', (c) => {
  const principal = requirePrincipal(c, ['user']);
  const deps = c.get('deps');
  const jobId = Id.safeParse(c.req.param('jobId'));
  if (!jobId.success) throw new HttpError(400, 'invalid_request');
  return c.json(buildTimeline({ sqlite: deps.sqlite, principal, jobId: jobId.data }));
});

routes.get('/rollups', async (c) => {
  const principal = requirePrincipal(c, ['user']);
  const query = parseQuery(c, RollupQuery);
  const deps = c.get('deps');
  return c.json(await buildRollup({ sqlite: deps.sqlite, registry: deps.registry, principal, query }));
});

export default routes;
