/**
 * A buyer-facing messaging channel (WhatsApp today; SMS/RCS/Telegram later).
 * Business logic never calls a vendor SDK directly.
 */
export interface SendResult {
  providerMessageId: string;
  raw?: unknown;
}

export interface TemplateMessage {
  to: string; // E.164
  templateName: string; // must be pre-approved by Meta
  language?: string; // e.g. en, hi, kn
  bodyParams?: string[]; // {{1}}, {{2}}… in order
  headerDocument?: { link: string; filename: string }; // e.g. brochure PDF
  buttonUrlParam?: string; // dynamic URL button suffix
}

export interface TextMessage {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface DocumentMessage {
  to: string;
  link: string;
  filename: string;
  caption?: string;
}

export type InboundEvent =
  | {
      type: 'message';
      from: string; // E.164
      profileName?: string;
      providerMessageId: string;
      timestamp: Date;
      text?: string;
      /** quick-reply/button payloads */
      payload?: string;
      mediaId?: string;
      messageType: string;
      raw: unknown;
    }
  | {
      type: 'status';
      providerMessageId: string;
      status: 'sent' | 'delivered' | 'read' | 'failed';
      recipient: string;
      timestamp: Date;
      error?: string;
      raw: unknown;
    };

export interface WebhookRequest {
  query?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: string;
  body: unknown;
}

export interface MessageChannel {
  readonly name: string;
  /** Business-initiated outside the 24h window: approved template only. */
  sendTemplate(msg: TemplateMessage): Promise<SendResult>;
  /** Free-form text: only inside the 24h customer-service window. */
  sendText(msg: TextMessage): Promise<SendResult>;
  sendDocument(msg: DocumentMessage): Promise<SendResult>;
  /** GET verification handshake; returns the challenge string or null if invalid. */
  verifyChallenge(query: Record<string, string | undefined>): string | null;
  /** Validates the provider's signature on the raw body. */
  verifySignature(req: WebhookRequest): boolean;
  parseWebhook(req: WebhookRequest): InboundEvent[];
}
