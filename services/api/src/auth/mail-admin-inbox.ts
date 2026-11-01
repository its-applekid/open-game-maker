import { randomUUID } from 'node:crypto';

import type { Sqlite } from '@ogm/db';

import type { MailMessage, MailSender } from './mail.js';

export type MailRow = {
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  created_at: string;
  opened_at: string | null;
};

// The default sender (D-MAIL): every mail becomes a `mail_outbox` row an admin reads (OGM-017).
export class AdminInboxMailSender implements MailSender {
  constructor(private readonly sqlite: Sqlite) {}

  async send(m: MailMessage): Promise<{ id: string }> {
    const id = `m_${randomUUID()}`;
    this.sqlite
      .prepare('INSERT INTO mail_outbox (id, "to", subject, text, html, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, m.to, m.subject, m.text, m.html ?? null, new Date().toISOString());
    return { id };
  }
}

export function listOutbox(sqlite: Sqlite, opts: { limit?: number; unopened?: boolean } = {}): MailRow[] {
  const where = opts.unopened ? 'WHERE opened_at IS NULL' : '';
  return sqlite
    .prepare<[number], MailRow>(`SELECT * FROM mail_outbox ${where} ORDER BY created_at DESC, id LIMIT ?`)
    .all(opts.limit ?? 50);
}

export function markOpened(sqlite: Sqlite, id: string): boolean {
  return (
    sqlite
      .prepare('UPDATE mail_outbox SET opened_at = ? WHERE id = ? AND opened_at IS NULL')
      .run(new Date().toISOString(), id).changes > 0
  );
}
