import type { ControlDecl } from '@ogm/contracts';
import type { ZodType } from 'zod';

import type { Runtime } from './runtime.js';

export interface SaveSlice<S> {
  serialize(): S;
  restore(value: S): void;
}

export interface Feature<D, S> {
  id: string;
  schema: ZodType<D>;
  controls: ControlDecl[];
  save?: SaveSlice<S>;
  system?: (runtime: Runtime<D, S>) => void;
}

export function defineFeature<D, S = never>(feature: Feature<D, S>): Feature<D, S> {
  if (!/^[a-z][a-z0-9-]*$/.test(feature.id)) {
    throw new TypeError('feature id must be stable lowercase kebab-case');
  }
  return feature;
}
