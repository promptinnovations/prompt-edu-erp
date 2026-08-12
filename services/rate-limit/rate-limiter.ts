/**
 * PROMPT EDU ERP — rate limiter (ARCHITECTURE.md §X.1 "Rate limiting
 * applied at the edge/middleware for auth endpoints and bulk-write
 * endpoints (import, mark entry) to blunt brute-force and abuse").
 *
 * Two backends implement the same `checkRateLimit()` interface, chosen the
 * same way every other provider-swap in this codebase is (see
 * services/db/client.ts, services/auth/auth-service.ts):
 *
 *   - In-memory (default) — a plain fixed-window counter keyed by
 *     `${bucket}:${ip}`, scoped to a single Node process. Fine for local
 *     dev and a single-instance deployment; resets on restart and does NOT
 *     share state across multiple server instances behind a load balancer.
 *   - Upstash Redis (when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *     are set) — the same fixed-window counter, but backed by Redis
 *     INCR/PEXPIRE/PTTL, so every instance behind a load balancer shares
 *     one real limit. Upstash specifically (a REST-based Redis client,
 *     not a raw TCP connection) is what makes this usable from
 *     `middleware.ts`, which runs on Next.js's Edge runtime — a normal
 *     `redis`/`ioredis` TCP client doesn't work there.
 *
 * Both backends use the same "fixed window that starts on the first
 * request and resets windowMs later" semantics (not a true sliding-window
 * log) — simple, cheap, and good enough for blunting brute-force/abuse,
 * matching what this file already documented before the Redis backend
 * existed. The Redis path has one well-known, deliberately-accepted race:
 * if two requests hit the very first increment of a new window at the
 * exact same instant, both could observe count===1 and each issue a
 * PEXPIRE — harmless (they'd set the same TTL to the same value), not a
 * correctness bug, just worth naming explicitly.
 */
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// ---------------------------------------------------------------------------
// In-memory backend (default — no env vars needed)
// ---------------------------------------------------------------------------
interface Bucket {
  windowStartMs: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

// Periodically forget stale buckets so this Map can't grow unbounded over
// a long-running process — a real concern for an in-memory limiter that
// isn't otherwise capped.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweepIfDue(nowMs: number) {
  if (nowMs - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = nowMs;
  for (const [key, bucket] of buckets) {
    if (nowMs - bucket.windowStartMs > SWEEP_INTERVAL_MS) buckets.delete(key);
  }
}

function checkRateLimitInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepIfDue(now);

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStartMs >= windowMs) {
    buckets.set(key, { windowStartMs: now, count: 1 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.ceil((existing.windowStartMs + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Upstash Redis backend (opt-in — see docs/SETUP.md)
// ---------------------------------------------------------------------------
let cachedRedis: Redis | null | undefined; // undefined = not yet resolved this process

function getRedisClient(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}

async function checkRateLimitDistributed(redis: Redis, key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    // First request in a fresh window — start its TTL clock. If this key
    // somehow already had a stale TTL from a previous, since-expired
    // window (shouldn't happen — Redis drops the key entirely on expiry,
    // which is why INCR started it back at 1), this still just resets the
    // clock correctly.
    await redis.pexpire(redisKey, windowMs);
  }

  if (count > limit) {
    const ttlMs = await redis.pttl(redisKey);
    const retryAfterSeconds = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param key       identifies the bucket, e.g. `login:203.0.113.4`
 * @param limit     max requests allowed within `windowMs`
 * @param windowMs  fixed window size in milliseconds
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (!redis) return checkRateLimitInMemory(key, limit, windowMs);
  return checkRateLimitDistributed(redis, key, limit, windowMs);
}

/** Test-only: clears all in-memory buckets AND forgets which backend was
 *  resolved, so a test that sets/unsets UPSTASH_REDIS_REST_URL/TOKEN gets a
 *  fresh decision on its next checkRateLimit() call instead of reusing
 *  whichever backend an earlier test in the same process resolved first. */
export function __resetRateLimiterForTests() {
  buckets.clear();
  cachedRedis = undefined;
}
