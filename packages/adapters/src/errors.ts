export class AdapterError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'AdapterError';
  }
}

export class NotImplementedError extends Error {
  constructor(provider: string, method: string) {
    super(`[${provider}] ${method} is not implemented yet (stub)`);
    this.name = 'NotImplementedError';
  }
}

/** Small fetch wrapper with JSON + error mapping, shared by HTTP adapters. */
export async function httpJson<T>(provider: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new AdapterError(provider, `HTTP ${res.status} for ${url.split('?')[0]}`, res.status, body);
  }
  return body as T;
}
