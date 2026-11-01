import type { Sqlite } from '@ogm/db';

import type { UserDirectory } from '../app/registry.js';

type EmailRow = { email: string };
type IdRow = { id: string };

export function createUserDirectory(sqlite: Sqlite): UserDirectory {
  const emailForUser = sqlite.prepare<[string], EmailRow>('SELECT email FROM user WHERE id = ? LIMIT 1');
  const userIdForEmail = sqlite.prepare<[string], IdRow>('SELECT id FROM user WHERE email = ? LIMIT 1');

  return {
    emailForUser: async (userId) => emailForUser.get(userId)?.email ?? null,
    userIdForEmail: async (email) => userIdForEmail.get(email.trim().toLowerCase())?.id ?? null,
  };
}
