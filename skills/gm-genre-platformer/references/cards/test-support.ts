import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { FixedClock } from '@gm/sdk/core';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

export type Steppable = { step(deltaMs: number): void };

const clocks = new WeakMap<Steppable, FixedClock>();

export function advanceTime(target: Steppable, milliseconds: number): void {
  const clock = clocks.get(target) ?? new FixedClock((deltaSeconds) => target.step(deltaSeconds * 1000));
  clocks.set(target, clock);
  clock.advance(milliseconds);
}

export async function loadCardModule(importMetaUrl: string): Promise<Record<string, unknown>> {
  const testFile = fileURLToPath(importMetaUrl);
  const markdown = readFileSync(testFile.replace(/\.test\.ts$/, '.md'), 'utf8');
  const source = markdown.match(/```ts\n([\s\S]*?)\n```/)?.[1];
  if (!source) throw new Error(`card has no TypeScript snippet: ${testFile}`);
  const javascript = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
    fileName: testFile.replace(/\.test\.ts$/, '.ts'),
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`) as Promise<
    Record<string, unknown>
  >;
}
