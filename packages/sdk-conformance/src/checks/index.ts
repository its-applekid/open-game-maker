import type { Check } from '../types.js';
import { c01Manifest } from './c01-manifest.js';
import { c02Controls } from './c02-controls.js';
import { c03Save } from './c03-save.js';
import { c04Migrate } from './c04-migrate.js';
import { c05Capabilities } from './c05-capabilities.js';
import { c06Pause } from './c06-pause.js';
import { c07Stills } from './c07-stills.js';
import { c08Published } from './c08-published.js';
import { c09Hints } from './c09-hints.js';
import { c10EntityIds } from './c10-entity-ids.js';
import { c11Palette } from './c11-palette.js';

/** A4 §10.3's nine checks then B7 §2's two, in report order. */
export const CHECKS: Check[] = [
  c01Manifest,
  c02Controls,
  c03Save,
  c04Migrate,
  c05Capabilities,
  c06Pause,
  c07Stills,
  c08Published,
  c09Hints,
  c10EntityIds,
  c11Palette,
];
