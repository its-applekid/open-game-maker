import { fileURLToPath, pathToFileURL } from 'node:url';

import { createRepairApi } from './api.js';
import { loadRepairConfig } from './config.js';
import { loadRepairEnv } from './env.js';
import { createWorker, pollRepairWorker } from './worker.js';

export * from './api.js';
export * from './config.js';
export * from './editor-hint.js';
export * from './env.js';
export * from './promise-gen.js';
export * from './ticket-body.js';
export * from './triage.js';
export * from './worker.js';

export async function runRepairService(signal?: AbortSignal): Promise<void> {
  const config = loadRepairConfig(fileURLToPath(new URL('../repair.config.json', import.meta.url)));
  const env = loadRepairEnv();
  const api = createRepairApi({
    baseUrl: env.apiInternalUrl,
    token: env.internalToken,
    wallClockMinutes: config.wallClockMinutes,
  });
  const worker = createWorker({
    api,
    config,
    gamesRoot: env.gamesRoot,
    log: (line) => console.log(JSON.stringify(line)),
  });
  await pollRepairWorker(worker, config.pollMs, signal);
}

const executable = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executable) {
  void runRepairService().catch((error: unknown) => {
    console.error(
      JSON.stringify({ event: 'repair-service-failed', error: error instanceof Error ? error.name : 'unknown' }),
    );
    process.exitCode = 1;
  });
}
