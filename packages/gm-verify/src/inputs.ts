import { readFileSync } from 'node:fs';

import { MAX_PLAYERS, type ActionFrame } from '@ogm/contracts';
import { z } from 'zod';

import type { HookDriver } from './hooks.js';

const STEP_MS = 1000 / 60;

/** `--inputs script.json`: logical actions at game times (e2e.mjs pattern), replayed through `inject`. */
export const inputScriptSchema = z.array(
  z.object({
    t: z.number().min(0),
    action: z.string().min(1).max(32),
    phase: z.enum(['down', 'up']).default('down'),
    value: z.union([z.number(), z.boolean()]).optional(),
    playerIndex: z
      .number()
      .int()
      .min(0)
      .max(MAX_PLAYERS - 1)
      .default(0),
  }),
);
export type InputScript = z.infer<typeof inputScriptSchema>;

export function readInputScript(path: string): InputScript {
  return inputScriptSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function toFrame(step: InputScript[number]): ActionFrame {
  return {
    playerIndex: step.playerIndex,
    tick: Math.floor((step.t * 1000) / STEP_MS),
    source: 'keyboard',
    actions: { [step.action]: step.value ?? step.phase === 'down' },
  };
}

/** Advances game time to each step with `advanceTime` (never `renderAt`, which re-keys state) and injects it. */
export async function replayInputs(h: HookDriver, script: InputScript): Promise<number> {
  let now = 0;
  for (const step of [...script].sort((a, b) => a.t - b.t)) {
    const ms = step.t * 1000;
    if (ms > now) await h.advanceTime(ms - now);
    now = Math.max(now, ms);
    await h.inject(toFrame(step));
  }
  await h.advanceTime(STEP_MS);
  return now + STEP_MS;
}
