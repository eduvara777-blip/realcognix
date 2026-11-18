/**
 * Fixed-window failure counter per key (email+IP). In-memory, so it is per API process;
 * the persistent account lock lives in user_credentials. Swap for Redis when running several API replicas.
 */
export class LoginLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly now = () => Date.now()) {}

  /** Seconds until the key may try again, or 0 if allowed. */
  blockedFor(key: string): number {
    const h = this.hits.get(key);
    if (!h) return 0;
    if (this.now() >= h.resetAt) { this.hits.delete(key); return 0; }
    return h.count >= this.max ? Math.ceil((h.resetAt - this.now()) / 1000) : 0;
  }

  fail(key: string) {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t >= h.resetAt) this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
    else h.count++;
    if (this.hits.size > 50_000) this.prune();
  }

  reset(key: string) { this.hits.delete(key); }

  private prune() {
    const t = this.now();
    for (const [k, h] of this.hits) if (t >= h.resetAt) this.hits.delete(k);
  }
}
