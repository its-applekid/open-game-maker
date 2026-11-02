import type { Sqlite } from '@ogm/db';

export const PLAY_LEASE_TTL_MS = 30_000;

type LeaseHolder = { userId: string; gameId: string; deviceId: string; tabId: string };
type LeaseOptions = { now?: Date; takeover?: boolean; ttlMs?: number };
type LeaseRow = { device_id: string; tab_id: string; expires_at: string };

export class LeaseHeld extends Error {
  constructor(readonly heldBy: string) {
    super('the play lease is held by another device');
    this.name = 'LeaseHeld';
  }
}

export class LeaseMismatch extends Error {
  constructor(readonly heldBy: string | null) {
    super('the caller does not hold the play lease');
    this.name = 'LeaseMismatch';
  }
}

function readLease(sqlite: Sqlite, userId: string, gameId: string): LeaseRow | undefined {
  return sqlite
    .prepare<[string, string], LeaseRow>(
      'SELECT device_id, tab_id, expires_at FROM play_leases WHERE user_id = ? AND game_id = ?',
    )
    .get(userId, gameId);
}

function nextExpiry(now: Date, ttlMs = PLAY_LEASE_TTL_MS): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

export function acquirePlayLease(
  sqlite: Sqlite,
  holder: LeaseHolder,
  options: LeaseOptions = {},
): { expiresAt: string; previousHolder?: string } {
  const now = options.now ?? new Date();
  return sqlite
    .transaction(() => {
      const existing = readLease(sqlite, holder.userId, holder.gameId);
      const active = existing !== undefined && existing.expires_at > now.toISOString();
      const heldByOther = active && existing.device_id !== holder.deviceId;
      if (heldByOther && options.takeover !== true) throw new LeaseHeld(existing.device_id);

      const expiresAt = nextExpiry(now, options.ttlMs);
      sqlite
        .prepare(
          `INSERT INTO play_leases (user_id, game_id, device_id, tab_id, expires_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, game_id) DO UPDATE SET
             device_id = excluded.device_id,
             tab_id = excluded.tab_id,
             expires_at = excluded.expires_at`,
        )
        .run(holder.userId, holder.gameId, holder.deviceId, holder.tabId, expiresAt);
      return heldByOther ? { expiresAt, previousHolder: existing.device_id } : { expiresAt };
    })
    .immediate();
}

export function heartbeatPlayLease(
  sqlite: Sqlite,
  holder: LeaseHolder,
  options: Pick<LeaseOptions, 'now' | 'ttlMs'> = {},
): { expiresAt: string } {
  const now = options.now ?? new Date();
  const expiresAt = nextExpiry(now, options.ttlMs);
  const updated = sqlite
    .prepare(
      `UPDATE play_leases SET expires_at = ?
       WHERE user_id = ? AND game_id = ? AND device_id = ? AND tab_id = ? AND expires_at > ?`,
    )
    .run(expiresAt, holder.userId, holder.gameId, holder.deviceId, holder.tabId, now.toISOString());
  if (updated.changes !== 1) {
    const existing = readLease(sqlite, holder.userId, holder.gameId);
    throw new LeaseMismatch(existing && existing.expires_at > now.toISOString() ? existing.device_id : null);
  }
  return { expiresAt };
}

export function assertPlayLease(
  sqlite: Sqlite,
  input: { userId: string; gameId: string; deviceId: string; now?: Date },
): void {
  const now = input.now ?? new Date();
  const existing = readLease(sqlite, input.userId, input.gameId);
  if (!existing || existing.device_id !== input.deviceId || existing.expires_at <= now.toISOString()) {
    throw new LeaseMismatch(existing && existing.expires_at > now.toISOString() ? existing.device_id : null);
  }
}
