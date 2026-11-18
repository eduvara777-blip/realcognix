export interface EmailAttachment {
  filename: string;
  path?: string; // local path or URL
  content?: Buffer | string;
  contentType?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  attachments?: EmailAttachment[];
  headers?: Record<string, string>; // e.g. List-Unsubscribe
  tags?: string[];
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<{ providerMessageId: string }>;
  verify?(): Promise<boolean>;
}
