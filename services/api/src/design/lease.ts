import type { Sqlite } from '@ogm/db';

export const DEFAULT_LEASE_TTL_MS = 120_000;

type LeaseKey = { gameId: string; branchId: string };
type LeaseHolder = LeaseKey & { userId: string; sessionId: string };
type FencedLeaseHolder = LeaseHolder & { token: number };
type LeaseOptions = { now?: Date; ttlMs?: number };
type LeaseRow = {
  holder_user_id: string;
  session_id: string;
  token: number;
  expires_at: string;
};

export class LeaseHeld extends Error {
  readonly holderUserId: string;

  constructor(holderUserId: string) {
    super('the edit lease is held by another user');
    this.name = 'LeaseHeld';
    this.holderUserId = holderUserId;
  }
}

export class LeaseMismatch extends Error {
  constructor() {
    super('the edit lease token or session is stale');
    this.name = 'LeaseMismatch';
  }
}

function leaseRow(sqlite: Sqlite, key: LeaseKey): LeaseRow | undefined {
  return sqlite
    .prepare<[string, string], LeaseRow>(
      `SELECT holder_user_id, session_id, token, expires_at
       FROM edit_leases
       WHERE game_id = ? AND branch_id = ?`,
    )
    .get(key.gameId, key.branchId);
}

function expiresAt(options: LeaseOptions): string {
  const now = options.now ?? new Date();
  return new Date(now.getTime() + (options.ttlMs ?? DEFAULT_LEASE_TTL_MS)).toISOString();
}

export function acquireLease(
  sqlite: Sqlite,
  holder: LeaseHolder,
  options: LeaseOptions = {},
): { token: number; expiresAt: string } {
  const now = options.now ?? new Date();
  return sqlite
    .transaction(() => {
      const existing = leaseRow(sqlite, holder);
      if (
        existing !== undefined &&
        existing.expires_at > now.toISOString() &&
        existing.holder_user_id !== holder.userId
      ) {
        throw new LeaseHeld(existing.holder_user_id);
      }

      const token = (existing?.token ?? 0) + 1;
      const nextExpiry = expiresAt({ ...options, now });
      sqlite
        .prepare(
          `INSERT INTO edit_leases
             (game_id, branch_id, holder_user_id, session_id, token, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(game_id, branch_id) DO UPDATE SET
             holder_user_id = excluded.holder_user_id,
             session_id = excluded.session_id,
             token = excluded.token,
             expires_at = excluded.expires_at`,
        )
        .run(holder.gameId, holder.branchId, holder.userId, holder.sessionId, token, nextExpiry);
      return { token, expiresAt: nextExpiry };
    })
    .immediate();
}

export function heartbeatLease(
  sqlite: Sqlite,
  holder: FencedLeaseHolder,
  options: LeaseOptions = {},
): { token: number; expiresAt: string } {
  const now = options.now ?? new Date();
  const nextExpiry = expiresAt({ ...options, now });
  const result = sqlite
    .prepare(
      `UPDATE edit_leases
       SET expires_at = ?
       WHERE game_id = ? AND branch_id = ? AND holder_user_id = ?
         AND session_id = ? AND token = ? AND expires_at > ?`,
    )
    .run(nextExpiry, holder.gameId, holder.branchId, holder.userId, holder.sessionId, holder.token, now.toISOString());
  if (result.changes !== 1) throw new LeaseMismatch();
  return { token: holder.token, expiresAt: nextExpiry };
}

export function releaseLease(sqlite: Sqlite, holder: FencedLeaseHolder): boolean {
  return (
    sqlite
      .prepare(
        `UPDATE edit_leases
         SET expires_at = '1970-01-01T00:00:00.000Z'
         WHERE game_id = ? AND branch_id = ? AND holder_user_id = ? AND session_id = ? AND token = ?`,
      )
      .run(holder.gameId, holder.branchId, holder.userId, holder.sessionId, holder.token).changes === 1
  );
}

export function assertLeaseForWrite(sqlite: Sqlite, holder: FencedLeaseHolder, now = new Date()): void {
  const existing = leaseRow(sqlite, holder);
  if (
    existing === undefined ||
    existing.holder_user_id !== holder.userId ||
    existing.session_id !== holder.sessionId ||
    existing.token !== holder.token ||
    existing.expires_at <= now.toISOString()
  ) {
    throw new LeaseMismatch();
  }
}
