import { CompleteTriage, TriageClaim, type CompleteTriage as CompleteTriageValue } from '@ogm/contracts';

import type { RepairApi } from './worker.js';

export type RepairApiOptions = {
  baseUrl: string;
  token: string;
  wallClockMinutes: number;
  fetch?: typeof fetch;
  now?: () => Date;
};

export function createRepairApi(options: RepairApiOptions): RepairApi {
  const request = options.fetch ?? fetch;
  const headers = { authorization: `Bearer ${options.token}`, 'x-ogm-service': 'repair' };
  const url = (path: string) => new URL(path, options.baseUrl).href;
  async function json(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await request(url(path), {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(options.wallClockMinutes * 60_000),
      headers: { ...headers, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    });
    if (!response.ok) throw new Error(`repair API ${response.status}`);
    return response.json();
  }
  return {
    async claim() {
      const now = (options.now ?? (() => new Date()))();
      const response = (await json('/api/v1/reports/triage/claim', {
        method: 'POST',
        body: JSON.stringify({
          now: now.toISOString(),
          staleBefore: new Date(now.getTime() - options.wallClockMinutes * 60_000).toISOString(),
        }),
      })) as { report?: unknown };
      if (response.report === null) return null;
      return TriageClaim.parse(response);
    },
    async uploadDiagnostics(reportId, diagnostics) {
      const response = (await json(`/api/v1/reports/triage/${reportId}/diagnostics`, {
        method: 'POST',
        body: JSON.stringify(diagnostics),
      })) as { diagnosticsKey: string };
      return response.diagnosticsKey;
    },
    async findOpen(signature, exclude) {
      const query = new URLSearchParams({ signature, exclude });
      const response = (await json(`/api/v1/reports/triage/dedupe?${query}`)) as { jobId: string | null };
      return response.jobId;
    },
    async complete(reportId, completion) {
      return CompleteTriage.parse(
        await json(`/api/v1/reports/triage/${reportId}/complete`, {
          method: 'POST',
          body: JSON.stringify(completion),
        }),
      ) as CompleteTriageValue;
    },
  };
}
