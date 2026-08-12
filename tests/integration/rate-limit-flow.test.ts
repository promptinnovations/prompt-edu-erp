/**
 * PROMPT EDU ERP — Rate limiting (ARCHITECTURE.md §X.1, Phase 18; Upstash
 * backend added as a §AA follow-up). Unit-level tests for the fixed-window
 * limiter itself (both backends), plus an end-to-end test invoking the
 * actual `middleware()` function (not a reimplementation of it) with
 * fabricated NextRequest objects, proving POST /login is throttled after
 * its configured limit while GET /login and unrelated POST paths are never
 * touched.
 *
 * The Upstash-backed describe block mocks "@upstash/redis" with a tiny
 * in-memory fake implementing incr/pexpire/pttl — this is deliberate, not
 * a shortcut: it lets the REAL distributed-backend code path in
 * rate-limiter.ts (the INCR/PEXPIRE/PTTL logic, the count>limit decision,
 * the retryAfterSeconds computation) run and get asserted on every test
 * run, with no live Upstash project or network access needed. Unlike the
 * Supabase Auth swap (which needs a real external identity provider round
 * trip that genuinely can't be faked locally), Redis commands are simple
 * enough that a fake honoring the same three-method contract gives full,
 * meaningful coverage — see docs/SETUP.md for the one-time manual check
 * recommended against a real Upstash database before relying on this in
 * production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@upstash/redis", () => {
  class FakeRedis {
    private store = new Map<string, { count: number; expiresAt: number | null }>();

    async incr(key: string): Promise<number> {
      const now = Date.now();
      const existing = this.store.get(key);
      if (!existing || (existing.expiresAt !== null && now >= existing.expiresAt)) {
        this.store.set(key, { count: 1, expiresAt: null });
        return 1;
      }
      existing.count += 1;
      return existing.count;
    }

    async pexpire(key: string, ms: number): Promise<number> {
      const existing = this.store.get(key);
      if (!existing) return 0;
      existing.expiresAt = Date.now() + ms;
      return 1;
    }

    async pttl(key: string): Promise<number> {
      const existing = this.store.get(key);
      if (!existing || existing.expiresAt === null) return -1;
      return Math.max(0, existing.expiresAt - Date.now());
    }
  }
  return { Redis: FakeRedis };
});

// Imported AFTER vi.mock (vitest hoists the mock above these regardless of
// source order, but writing it this way keeps the file readable top to
// bottom).
import { checkRateLimit, __resetRateLimiterForTests } from "../../services/rate-limit/rate-limiter";
import { middleware } from "../../middleware";

beforeEach(() => {
  __resetRateLimiterForTests();
});

describe("checkRateLimit (in-memory backend — default, no env vars)", () => {
  it("allows requests up to the limit, then blocks", async () => {
    const key = "test-bucket:1.2.3.4";
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key, 5, 60_000);
      expect(result.allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate buckets for different keys", async () => {
    const a = await checkRateLimit("bucket:a", 1, 60_000);
    const b = await checkRateLimit("bucket:b", 1, 60_000);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    // second request against "a" should now be blocked, independent of "b"
    expect((await checkRateLimit("bucket:a", 1, 60_000)).allowed).toBe(false);
  });

  it("resets the window after windowMs has elapsed", async () => {
    const key = "test-bucket-reset";
    expect((await checkRateLimit(key, 1, 50)).allowed).toBe(true);
    expect((await checkRateLimit(key, 1, 50)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await checkRateLimit(key, 1, 50)).allowed).toBe(true);
  });
});

describe("checkRateLimit (Upstash Redis backend, mocked)", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://fake-instance.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
    __resetRateLimiterForTests();
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetRateLimiterForTests();
  });

  it("allows requests up to the limit, then blocks (via INCR/PEXPIRE/PTTL)", async () => {
    const key = "upstash-bucket:5.6.7.8";
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key, 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - (i + 1));
    }
    const blocked = await checkRateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate buckets for different keys", async () => {
    const a = await checkRateLimit("upstash-bucket:a", 1, 60_000);
    const b = await checkRateLimit("upstash-bucket:b", 1, 60_000);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect((await checkRateLimit("upstash-bucket:a", 1, 60_000)).allowed).toBe(false);
  });

  it("resets the window after windowMs has elapsed", async () => {
    const key = "upstash-bucket-reset";
    expect((await checkRateLimit(key, 1, 50)).allowed).toBe(true);
    expect((await checkRateLimit(key, 1, 50)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await checkRateLimit(key, 1, 50)).allowed).toBe(true);
  });
});

describe("middleware() — end to end against the real rule table", () => {
  function postRequest(path: string, ip = "9.9.9.9") {
    return new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { "x-forwarded-for": ip },
    });
  }
  function getRequest(path: string, ip = "9.9.9.9") {
    return new NextRequest(`http://localhost${path}`, {
      method: "GET",
      headers: { "x-forwarded-for": ip },
    });
  }

  it("throttles repeated POST /login from the same IP after the configured limit (10/min)", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await middleware(postRequest("/login"));
      expect(res.status).not.toBe(429);
    }
    const eleventh = await middleware(postRequest("/login"));
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers.get("Retry-After")).toBeTruthy();
  });

  it("never throttles GET /login regardless of volume", async () => {
    for (let i = 0; i < 50; i++) {
      const res = await middleware(getRequest("/login"));
      expect(res.status).not.toBe(429);
    }
  });

  it("tracks different IPs independently", async () => {
    for (let i = 0; i < 10; i++) await middleware(postRequest("/login", "1.1.1.1"));
    const blockedForFirstIp = await middleware(postRequest("/login", "1.1.1.1"));
    expect(blockedForFirstIp.status).toBe(429);

    const allowedForSecondIp = await middleware(postRequest("/login", "2.2.2.2"));
    expect(allowedForSecondIp.status).not.toBe(429);
  });

  it("does not rate-limit an unrelated POST path", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await middleware(postRequest("/dashboard"));
      expect(res.status).not.toBe(429);
    }
  });

  it("applies the mark-entry bucket to nested examination marks paths", async () => {
    const path = "/examinations/abc-123/marks/def-456";
    for (let i = 0; i < 60; i++) {
      const res = await middleware(postRequest(path));
      expect(res.status).not.toBe(429);
    }
    const overLimit = await middleware(postRequest(path));
    expect(overLimit.status).toBe(429);
  });
});
