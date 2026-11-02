import { readFileSync } from 'node:fs';

import {
  DEFAULT_REPAIR_CONFIG,
  RepairConfig as RepairConfigSchema,
  type RepairConfig as RepairConfigValue,
} from '@ogm/contracts';

export { DEFAULT_REPAIR_CONFIG };
export type RepairConfig = RepairConfigValue;

export function loadRepairConfig(
  path: string,
  warn: (message: string) => void = (message) => console.warn(message),
): RepairConfig {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    warn('repair config missing; using documented defaults');
    return DEFAULT_REPAIR_CONFIG;
  }
  return RepairConfigSchema.parse(JSON.parse(raw));
}
