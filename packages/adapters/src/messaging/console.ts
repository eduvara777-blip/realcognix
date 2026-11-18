import { randomUUID } from 'node:crypto';
import type { DocumentMessage, InboundEvent, MessageChannel, SendResult, TemplateMessage, TextMessage, WebhookRequest } from './types.js';

/**
 * Dev channel: logs instead of sending, so the whole pipeline runs with no Meta account.
 * Inbound messages can be simulated by POSTing the simple shape {from, text} to /webhooks/whatsapp.
 */
export class ConsoleChannel implements MessageChannel {
  readonly name = 'console';
  readonly sent: Array<{ kind: string; payload: unknown }> = [];

  constructor(private readonly verifyToken = 'dev-verify-token', private readonly log: (msg: string) => void = console.log) {}

  async sendTemplate(msg: TemplateMessage): Promise<SendResult> {
    return this.record('template', msg, `[whatsapp:console] template "${msg.templateName}" -> ${msg.to} params=${JSON.stringify(msg.bodyParams ?? [])}`);
  }
  async sendText(msg: TextMessage): Promise<SendResult> {
    return this.record('text', msg, `[whatsapp:console] text -> ${msg.to}: ${msg.body}`);
  }
  async sendDocument(msg: DocumentMessage): Promise<SendResult> {
    return this.record('document', msg, `[whatsapp:console] document -> ${msg.to}: ${msg.filename}`);
  }
  verifyChallenge(query: Record<string, string | undefined>): string | null {
    return query['hub.verify_token'] === this.verifyToken ? (query['hub.challenge'] ?? 'ok') : null;
  }
  verifySignature(): boolean {
    return true;
  }
  parseWebhook(req: WebhookRequest): InboundEvent[] {
    const b = req.body as { from?: string; text?: string; name?: string };
    if (!b?.from) return [];
    return [{
      type: 'message',
      from: b.from.startsWith('+') ? b.from : `+${b.from}`,
      profileName: b.name,
      providerMessageId: `console-in-${randomUUID()}`,
      timestamp: new Date(),
      messageType: 'text',
      text: b.text,
      raw: b,
    }];
  }
  private record(kind: string, payload: unknown, line: string): SendResult {
    this.sent.push({ kind, payload });
    this.log(line);
    return { providerMessageId: `console-${randomUUID()}` };
  }
}
