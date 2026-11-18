export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer, contentType?: string): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  /** Public or signed URL for sharing a brochure on WhatsApp/email. */
  url(key: string, expiresInSec?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
