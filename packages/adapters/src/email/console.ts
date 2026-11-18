import { randomUUID } from 'node:crypto';
import type { EmailMessage, EmailProvider } from './types.js';

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  constructor(private readonly log: (msg: string) => void = console.log) {}
  async send(msg: EmailMessage) {
    this.log(`[email:console] to=${String(msg.to)} subject="${msg.subject}"`);
    return { providerMessageId: `console-${randomUUID()}` };
  }
}
