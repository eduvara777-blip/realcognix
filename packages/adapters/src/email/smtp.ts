import nodemailer, { type Transporter } from 'nodemailer';
import { AdapterError } from '../errors.js';
import type { EmailMessage, EmailProvider } from './types.js';

export interface SmtpConfig {
  host: string; // Brevo: smtp-relay.brevo.com, Mailpit (dev): mailpit
  port: number; // Brevo: 587, Mailpit: 1025
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Any SMTP server. Works with Brevo (free tier, SMTP relay), Listmonk's SMTP, Amazon SES SMTP,
 * Gmail/Workspace relay, or Mailpit for local development.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor(private readonly cfg: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }

  async send(msg: EmailMessage): Promise<{ providerMessageId: string }> {
    try {
      const headers: Record<string, string> = { ...(msg.headers ?? {}) };
      if (msg.tags?.length) headers['X-Mailin-Tag'] = msg.tags.join(','); // Brevo tag header; ignored elsewhere
      const info = await this.transporter.sendMail({
        from: msg.from ?? this.cfg.from,
        to: msg.to,
        cc: msg.cc,
        replyTo: msg.replyTo,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        attachments: msg.attachments,
        headers,
      });
      return { providerMessageId: info.messageId };
    } catch (err) {
      throw new AdapterError(this.name, `send failed: ${(err as Error).message}`);
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
