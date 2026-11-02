import { HealthResponse } from '@ogm/contracts';

export type { HealthResponse } from '@ogm/contracts';

// The `GET /healthz` body every OGM service returns (contracts `health.v1`).
export function healthResponse(input: {
  service: string;
  version: string;
  startedAtMs: number;
  nowMs?: number;
  details?: Record<string, unknown>;
}): HealthResponse {
  const uptimeSec = Math.max(0, Math.floor(((input.nowMs ?? Date.now()) - input.startedAtMs) / 1000));
  return HealthResponse.parse({
    ok: true,
    service: input.service,
    version: input.version,
    uptimeSec,
    ...(input.details === undefined ? {} : { details: input.details }),
  });
}
