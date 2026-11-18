import { createHmac, timingSafeEqual } from 'node:crypto';
import { toWhatsAppId } from '@realcognix/core';
import { AdapterError, httpJson } from '../errors.js';
import type {
  DocumentMessage, InboundEvent, MessageChannel, SendResult, TemplateMessage, TextMessage, WebhookRequest,
} from './types.js';

export interface WhatsAppCloudConfig {
  phoneNumberId: string;
  accessToken: string;
  appSecret?: string;
  verifyToken: string;
  graphVersion: string; // v21.0
  defaultLanguage: string;
}

interface GraphSendResponse {
  messages?: Array<{ id: string }>;
}

/** Meta WhatsApp Business Cloud API (graph.facebook.com). Platform is free; Meta bills per conversation/template. */
export class WhatsAppCloudChannel implements MessageChannel {
  readonly name = 'whatsapp_cloud';

  constructor(private readonly cfg: WhatsAppCloudConfig) {
    if (!cfg.phoneNumberId || !cfg.accessToken) {
      throw new AdapterError(this.name, 'WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required');
    }
  }

  sendTemplate(msg: TemplateMessage): Promise<SendResult> {
    const components: unknown[] = [];
    if (msg.headerDocument) {
      components.push({ type: 'header', parameters: [{ type: 'document', document: msg.headerDocument }] });
    }
    if (msg.bodyParams?.length) {
      components.push({ type: 'body', parameters: msg.bodyParams.map((text) => ({ type: 'text', text })) });
    }
    if (msg.buttonUrlParam) {
      components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: msg.buttonUrlParam }] });
    }
    return this.send({
      to: toWhatsAppId(msg.to),
      type: 'template',
      template: { name: msg.templateName, language: { code: msg.language ?? this.cfg.defaultLanguage }, components },
    });
  }

  sendText(msg: TextMessage): Promise<SendResult> {
    return this.send({ to: toWhatsAppId(msg.to), type: 'text', text: { body: msg.body, preview_url: msg.previewUrl ?? false } });
  }

  sendDocument(msg: DocumentMessage): Promise<SendResult> {
    return this.send({
      to: toWhatsAppId(msg.to),
      type: 'document',
      document: { link: msg.link, filename: msg.filename, caption: msg.caption },
    });
  }

  verifyChallenge(query: Record<string, string | undefined>): string | null {
    return query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === this.cfg.verifyToken
      ? (query['hub.challenge'] ?? null)
      : null;
  }

  verifySignature(req: WebhookRequest): boolean {
    if (!this.cfg.appSecret) return true; // dev: signature check disabled when no secret configured
    return verifyMetaSignature(this.cfg.appSecret, req);
  }

  parseWebhook(req: WebhookRequest): InboundEvent[] {
    const body = req.body as WaWebhookBody;
    const events: InboundEvent[] = [];
    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (!v) continue;
        const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages ?? []) {
          events.push({
            type: 'message',
            from: `+${m.from}`,
            profileName: names.get(m.from),
            providerMessageId: m.id,
            timestamp: new Date(Number(m.timestamp) * 1000),
            messageType: m.type,
            text: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title,
            payload: m.button?.payload ?? m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id,
            mediaId: m.image?.id ?? m.document?.id ?? m.audio?.id,
            raw: m,
          });
        }
        for (const s of v.statuses ?? []) {
          events.push({
            type: 'status',
            providerMessageId: s.id,
            status: s.status,
            recipient: `+${s.recipient_id}`,
            timestamp: new Date(Number(s.timestamp) * 1000),
            error: s.errors?.map((e) => `${e.code}: ${e.title}`).join('; '),
            raw: s,
          });
        }
      }
    }
    return events;
  }

  private async send(payload: Record<string, unknown>): Promise<SendResult> {
    const url = `https://graph.facebook.com/${this.cfg.graphVersion}/${this.cfg.phoneNumberId}/messages`;
    const res = await httpJson<GraphSendResponse>(this.name, url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
    });
    const id = res.messages?.[0]?.id;
    if (!id) throw new AdapterError(this.name, 'No message id in response', undefined, res);
    return { providerMessageId: id, raw: res };
  }
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(appSecret, rawBody). Shared by WhatsApp + Lead Ads webhooks. */
export function verifyMetaSignature(appSecret: string, req: WebhookRequest): boolean {
  const header = req.headers['x-hub-signature-256'];
  const sig = Array.isArray(header) ? header[0] : header;
  if (!sig || !req.rawBody) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(req.rawBody).digest('hex')}`;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Webhook payload types (subset) ---
interface WaWebhookBody {
  object?: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value?: {
        metadata?: { phone_number_id: string; display_phone_number: string };
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          button?: { text: string; payload: string };
          interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
          image?: { id: string };
          document?: { id: string };
          audio?: { id: string };
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string }>;
        }>;
      };
    }>;
  }>;
}
