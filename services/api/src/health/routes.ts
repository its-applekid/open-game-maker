import { Hono } from 'hono';

import { healthResponse } from '@ogm/health';

import type { ApiBindings } from '../app/types.js';
import { checkpointHealthDetails } from '../checkpoints/health.js';

export const prefix = '/';

export default new Hono<ApiBindings>().get('/healthz', (c) => {
  const { version, startedAtMs } = c.get('deps');
  return c.json(
    healthResponse({
      service: 'api',
      version,
      startedAtMs,
      details: { checkpoint_decisions: checkpointHealthDetails(c.get('deps')) },
    }),
  );
});
