import type { Sqlite } from '@ogm/db';

import { AdminInboxMailSender } from './mail-admin-inbox.js';
import { SmtpMailSender } from './mail-smtp.js';

export type MailMessage = { to: string; subject: string; text: string; html?: string };

export interface MailSender {
  send(m: MailMessage): Promise<{ id: string }>;
}

// SMTP only when SMTP_URL is set; otherwise every mail lands in the admin inbox (D-MAIL).
export function selectMailSender(
  env: { SMTP_URL?: string; SMTP_FROM?: string },
  sqlite: Sqlite,
): { sender: MailSender; kind: 'smtp' | 'admin-inbox' } {
  if (env.SMTP_URL) return { sender: new SmtpMailSender(env.SMTP_URL, env.SMTP_FROM), kind: 'smtp' };
  return { sender: new AdminInboxMailSender(sqlite), kind: 'admin-inbox' };
}
