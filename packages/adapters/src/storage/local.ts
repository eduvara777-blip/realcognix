import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import type { StorageProvider } from './types.js';

/** Local filesystem storage for development. Swap for MinIO/S3/Supabase Storage via a new adapter. */
export class LocalStorage implements StorageProvider {
  readonly name = 'local';
  constructor(private readonly root: string, private readonly publicBaseUrl: string) {}

  private path(key: string) {
    const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    return join(this.root, safe);
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return { key };
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  async url(key: string) {
    return `${this.publicBaseUrl}/files/${encodeURI(key)}`;
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}
