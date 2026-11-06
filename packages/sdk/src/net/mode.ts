import type { AuthorityMode, GameManifest } from '@ogm/contracts';

/** Raised when a manifest's declared authority mode cannot run: a missing hook, or a mode this SDK does not have. */
export class ModeMismatchError extends Error {
  readonly code = 'MODE_MISMATCH';

  constructor(message: string) {
    super(message);
    this.name = 'ModeMismatchError';
  }
}

export type ModeManifest = Pick<GameManifest, 'net'> & Partial<Pick<GameManifest, 'id'>>;

/**
 * The one place a mode is decided (D-N2-1). Absent `manifest.net` means host authority, which is what every build
 * written before v2 runs, so the v1 code path stays byte-for-byte.
 */
export function resolveAuthorityMode(manifest: ModeManifest): AuthorityMode {
  return manifest.net?.authority ?? 'host';
}
