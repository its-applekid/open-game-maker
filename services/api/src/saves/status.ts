import type { SaveSlot } from '@ogm/contracts';

export function deriveSaveStatus(headSchema: number, currentSchema: number, migratesFrom?: number): SaveSlot['status'] {
  if (headSchema === currentSchema) return 'ok';
  if (migratesFrom !== undefined && headSchema === migratesFrom) return 'needs_migration';
  if (headSchema > currentSchema) return 'incompatible_after_rollback';
  return 'unsupported_old';
}
