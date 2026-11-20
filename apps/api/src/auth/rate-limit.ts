import { createHash } from 'node:crypto';

/**
 * Fixed-window failure counter per key (email+IP). In-memory, so it is per API process;
 * the persistent account lock lives in user_credentials. RedisLoginLimiter (below) shares it across replicas.
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

/** What /auth/login needs from a limiter. */
export interface LoginRateLimiter {
  blockedFor(key: string): Promise<number>;
  fail(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

/** The subset of ioredis used here (keeps tests free of a Redis server). */
export interface RedisLike {
  status: string;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

// INCR + set the window on the first failure, atomically. Returns [count, ms left in the window].
const FAIL_SCRIPT = `local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return n`;
const PEEK_SCRIPT = `local n = tonumber(redis.call('GET', KEYS[1]) or '0') return {n, redis.call('PTTL', KEYS[1])}`;

/**
 * Login limiter shared by every API replica through Redis (same fixed-window rules as LoginLimiter).
 * Falls back to the in-process LoginLimiter whenever Redis is not connected or a command fails or is slow,
 * so a Redis outage never blocks sign-in or turns the limiter off. Keys are hashed (no emails in Redis).
 */
export class RedisLoginLimiter implements LoginRateLimiter {
  private readonly memory: LoginLimiter;
  private warned = false;

  constructor(
    private readonly redis: RedisLike,
    private readonly max: number,
    private readonly windowMs: number,
    private readonly opts: { timeoutMs?: number; onFallback?: (err: unknown) => void; now?: () => number } = {},
  ) {
    this.memory = new LoginLimiter(max, windowMs, opts.now);
  }

  private key(k: string) {
    return `rl:login:${createHash('sha256').update(k).digest('base64url')}`;
  }

  /** Runs a Redis command, or returns undefined (→ use memory) when Redis is down, errors, or is slower than timeoutMs. */
  private async tryRedis<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (this.redis.status !== 'ready') return undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('redis timeout')), this.opts.timeoutMs ?? 250); }),
      ]);
    } catch (err) {
      if (!this.warned) { this.warned = true; this.opts.onFallback?.(err); }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  async blockedFor(key: string): Promise<number> {
    const r = await this.tryRedis(() => this.redis.eval(PEEK_SCRIPT, 1, this.key(key)) as Promise<[number, number]>);
    if (!r) return this.memory.blockedFor(key);
    const [count, pttl] = r;
    return count >= this.max && pttl > 0 ? Math.ceil(pttl / 1000) : 0;
  }

  async fail(key: string): Promise<void> {
    const r = await this.tryRedis(() => this.redis.eval(FAIL_SCRIPT, 1, this.key(key), this.windowMs));
    if (r === undefined) this.memory.fail(key);
  }

  async reset(key: string): Promise<void> {
    this.memory.reset(key);
    await this.tryRedis(() => this.redis.del(this.key(key)));
  }
}
