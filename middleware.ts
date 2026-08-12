/**
 * PROMPT EDU ERP — edge middleware (ARCHITECTURE.md §X.1). Three independent
 * concerns share this one file since Next.js only runs one middleware per
 * request:
 *
 *  1. Rate limiting on auth/bulk-write POST endpoints — see
 *     services/rate-limit/rate-limiter.ts for the two backends (in-memory
 *     single-instance by default, distributed via Upstash Redis when
 *     configured) sharing this one `checkRateLimit()` call.
 *  2. A nonce-based Content-Security-Policy (CSP), applied to every
 *     request (closes the "No Content-Security-Policy header" gap tracked
 *     in docs/SECURITY.md). A fresh, unpredictable nonce is generated per
 *     request and set both as a response header (inside the CSP value) and
 *     as a request header (`x-nonce`) that Next.js itself reads during
 *     server-side rendering to automatically attach the nonce to every
 *     script/style tag ITS OWN framework code injects (React/Next.js
 *     runtime, RSC hydration payloads) — see
 *     https://nextjs.org/docs/app/guides/content-security-policy. This
 *     app doesn't add its own inline scripts/styles or load any
 *     third-party script (verified before writing this: no next/script
 *     usage, no dangerouslySetInnerHTML, no inline `style={{...}}` props,
 *     no client-side fetch()/external-domain calls anywhere in app/ or
 *     the module UIs), so no manual nonce-threading into a page/layout is
 *     needed beyond what's below — 'strict-dynamic' plus the nonce is
 *     enough to let Next.js's own scripts run while blocking anything an
 *     attacker might try to inject.
 *  3. Supabase session refresh (§AA/§129 follow-up — was the actual cause
 *     of "always starts back at /login after closing the app"). §127's own
 *     tracked gap: services/auth/supabase-auth-provider.ts's getSession()
 *     can only WRITE a refreshed cookie from inside a Server Action/Route
 *     Handler (Next.js forbids cookie mutation during a plain page render),
 *     so a normal page load never had a chance to rotate an expired access
 *     token using the still-valid, longer-lived refresh token sitting right
 *     there in cookies — it just saw "expired" and bounced to /login.
 *     Middleware runs before every page render and IS allowed to write
 *     cookies onto the response, so this is the correct, framework-intended
 *     place for it (Supabase's own Next.js App Router guidance puts session
 *     refresh here). Skipped entirely when Supabase isn't configured (dev
 *     mode / DevAuthProvider), matching every other dual-backend check in
 *     this codebase (see services/auth/auth-service.ts's getAuthService()).
 *
 *  Nonce-based CSP requires every page to be dynamically rendered (a
 *  fresh nonce per request means no static HTML can be cached/reused) —
 *  already true here: every route reads the authenticated session
 *  server-side via requireRequestContext()/requireSuperAdminContext(),
 *  so `next build`'s route summary already shows every page as
 *  "ƒ (Dynamic)", none prerendered as static.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { checkRateLimit } from "./services/rate-limit/rate-limiter";

interface RateLimitRule {
  matches: (pathname: string) => boolean;
  bucket: string;
  limit: number;
  windowMs: number;
}

const RULES: RateLimitRule[] = [
  // Auth: brute-force protection on the login form itself.
  { matches: (p) => p === "/login", bucket: "login", limit: 10, windowMs: 60_000 },
  // Bulk-write: import wizard (stage/confirm actions all post to /import).
  { matches: (p) => p === "/import", bucket: "import", limit: 10, windowMs: 60_000 },
  // Bulk-write: mark entry pages.
  { matches: (p) => p.startsWith("/examinations/") && p.includes("/marks/"), bucket: "mark-entry", limit: 60, windowMs: 60_000 },
  // Bulk-write: template/export generation (real work per request).
  { matches: (p) => p.startsWith("/api/import-template/") || p.startsWith("/api/export/"), bucket: "bulk-io", limit: 20, windowMs: 60_000 },
];

function getClientKey(request: NextRequest): string {
  // Next.js 15's NextRequest no longer exposes `.ip` directly in every
  // deployment target — read the standard proxy header instead (set by
  // Vercel/most reverse proxies), falling back to a single shared bucket
  // if genuinely absent (e.g. local `next dev`) rather than throwing.
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Dev needs 'unsafe-inline' for style-src too (Next's dev-mode Fast
    // Refresh/style injection isn't nonce-aware) — production uses the
    // nonce, matching the framework's own documented dev-vs-prod split.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCsp(nonce, isDev);

  // Rate limiting — unchanged scope: only the specific POST endpoints
  // §X.1 names, checked before anything else. checkRateLimit() is async
  // because the Upstash-backed path (services/rate-limit/rate-limiter.ts)
  // makes a real REST call; Next.js Edge middleware supports an async
  // export natively, no other change needed here.
  if (request.method === "POST") {
    const pathname = request.nextUrl.pathname;
    const rule = RULES.find((r) => r.matches(pathname));
    if (rule) {
      const clientKey = getClientKey(request);
      const result = await checkRateLimit(`${rule.bucket}:${clientKey}`, rule.limit, rule.windowMs);
      if (!result.allowed) {
        return new NextResponse("Too many requests — please slow down and try again shortly.", {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSeconds), "Content-Security-Policy": csp },
        });
      }
    }
  }

  // CSP nonce — applied to every request that reaches here (see file
  // header comment for why: Next.js reads the nonce back out of this same
  // request header during rendering to stamp its own inline scripts).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Supabase session refresh — see file header comment (point 3). Only
  // reassigns `response` if @supabase/ssr actually needs to rotate cookies
  // (i.e. the access token had expired but the refresh token is still
  // valid); an already-fresh session makes no cookie writes at all here.
  const hasSupabaseConfig = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (hasSupabaseConfig) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Mirrors @supabase/ssr's own documented Next.js middleware
            // pattern: write the new cookies onto the (mutable) request so
            // this same request is consistent for the rest of this
            // function, then rebuild `response` from that updated request
            // so the rotated cookies actually reach the browser.
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request: { headers: requestHeaders } });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );
    // getUser() (not getSession()) for the same reason
    // supabase-auth-provider.ts's getSession() does — revalidates against
    // the Supabase Auth server rather than trusting a local cookie. As a
    // side effect, this is exactly what triggers @supabase/ssr's cookie
    // rotation above when the access token has expired but the refresh
    // token hasn't — the fix this whole block exists for.
    await supabase.auth.getUser();
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Runs on everything except Next's own static asset routes — a
  // sitewide CSP needs the nonce on every HTML response, and the rate
  // limiter's own RULES above still narrow which specific paths actually
  // get rate-limited within this same function.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
