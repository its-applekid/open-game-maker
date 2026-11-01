import { createTransport, type Transporter } from 'nodemailer';

import type { MailMessage, MailSender } from './mail.js';

export class SmtpMailSender implements MailSender {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from?: string,
    transport?: Transporter,
  ) {
    this.transport = transport ?? createTransport(url);
  }

  async send(m: MailMessage): Promise<{ id: string }> {
    const info = (await this.transport.sendMail({ from: this.from, ...m })) as { messageId: string };
    return { id: info.messageId };
  }
}
