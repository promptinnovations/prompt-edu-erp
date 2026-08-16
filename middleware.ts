/**
 * PROMPT EDU ERP — edge middleware (ARCHITECTURE.md §X.1). Four independent
 * concerns share this one file since Next.js only runs one middleware per
 * request:
 *
 *  0. Per-institution URL routing (§137 follow-up: "separate apps for each
 *     institution ... their url ... /mmp/login", and "I can't download
 *     different apps separately"). An institution's short code is now a
 *     REAL URL prefix, not just a one-time deep-link redirect:
 *       - /<code>            → redirect to /<code>/login (always, whether
 *                               or not the visitor is already signed in —
 *                               matches the exact behaviour the old
 *                               app/[code]/route.ts had, which this
 *                               supersedes and replaces).
 *       - /<code>/<rest>     → sets the active-institution cookie, then
 *                               REWRITES to /<rest> so every existing page
 *                               component keeps working completely
 *                               unchanged — only the visible URL differs.
 *       - /<rest> (no prefix) with an active-institution cookie already
 *         set → redirected to /<code>/<rest> so the whole session
 *         converges onto one distinct, installable-as-its-own-app URL
 *         scope (this is what app/manifest.ts's per-identity `scope` and
 *         `start_url` are keyed off — see services/branding/
 *         app-identity.ts). A visitor who never used an institution's own
 *         /<code> URL at all sees no change whatsoever (no cookie, no
 *         redirect) — fully backward compatible with the flat routes this
 *         app always had.
 *     Any path segment containing a "." (favicon.ico, manifest.webmanifest,
 *     robots.txt, *.svg, ...) is never treated as a candidate institution
 *     code — a real code can never contain a dot anyway (see
 *     services/super-admin/reserved-codes.ts's institutionCodeSchema
 *     regex), so this is both a correctness guard for static assets and
 *     consistent with that existing validation rule.
 *  1. Rate limiting on auth/bulk-write POST endpoints — see
 *     services/rate-limit/rate-limiter.ts for the two backends (in-memory
 *     single-instance by default, distributed via Upstash Redis when
 *     configured) sharing this one `checkRateLimit()` call. Matches
 *     against the LOGICAL path (e.g. "/login"), not whatever
 *     institution-prefixed URL it was reached through, so a rule doesn't
 *     silently stop applying just because a request came in as
 *     "/mmp/login" instead of "/login" — Next.js Server Actions POST to
 *     whatever URL the page is currently on.
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
import { RESERVED_INSTITUTION_CODES } from "./services/super-admin/reserved-codes";
import { ACTIVE_INSTITUTION_COOKIE } from "./services/tenant/institution-cookie";

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

// Reserved segments that are real institution-facing app pages — if
// requested WITHOUT an institution prefix while an active-institution
// cookie already exists, the visible URL converges onto /<code>/<path>.
// Deliberately excludes asset/platform-only reserved segments (api,
// icons, icon-badge, favicon.ico, manifest.webmanifest, robots.txt,
// sitemap.xml, sw.js, _next, super-admin) — those always stay exactly
// where they are, cookie or no cookie.
const INSTITUTION_APP_PAGES = new Set([
  "dashboard", "academic", "classes", "students", "examinations", "attendance",
  "analytics", "skills", "achievements", "scoring", "library", "staff",
  "discipline", "mentoring", "reports", "import", "announcements",
  "storage", "users", "settings", "login", "portal", "suspended",
  "module-unavailable",
]);

interface InstitutionRouting {
  /** The path Next.js should actually resolve a route for this request. */
  logicalPathname: string;
  /** Set → short-circuit with a redirect to this pathname (existing query
   *  string preserved) instead of continuing through rate-limiting/CSP/
   *  session-refresh at all; the browser's next request starts fresh. */
  redirectTo: string | null;
  /** Set → this is an institution-prefixed URL being served this request;
   *  write it as the active-institution cookie on the response. */
  setInstitutionCode: string | null;
}

function resolveInstitutionRouting(request: NextRequest): InstitutionRouting {
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);
  const seg0 = segments[0];

  // No segment, or the first segment is a file-like static asset request
  // (contains a ".", e.g. favicon.ico/manifest.webmanifest/robots.txt/
  // *.svg) — never a real institution code (institutionCodeSchema forbids
  // dots), so never touch routing for these.
  if (!seg0 || seg0.includes(".")) {
    return { logicalPathname: pathname, redirectTo: null, setInstitutionCode: null };
  }

  if (!RESERVED_INSTITUTION_CODES.has(seg0)) {
    // Looks like /<code>/... — an institution-scoped URL.
    if (segments.length === 1) {
      // Bare /<code> always lands on that institution's own login,
      // exactly like the old app/[code]/route.ts did.
      return { logicalPathname: pathname, redirectTo: `/${seg0}/login`, setInstitutionCode: null };
    }
    const rest = "/" + segments.slice(1).join("/");
    return { logicalPathname: rest, redirectTo: null, setInstitutionCode: seg0 };
  }

  // A real top-level app page requested WITHOUT an institution prefix —
  // if there's already an active institution selected, converge the
  // visible URL onto its prefixed form.
  if (INSTITUTION_APP_PAGES.has(seg0)) {
    const cookieCode = request.cookies.get(ACTIVE_INSTITUTION_COOKIE)?.value;
    if (cookieCode && !RESERVED_INSTITUTION_CODES.has(cookieCode)) {
      return { logicalPathname: pathname, redirectTo: `/${cookieCode}${pathname}`, setInstitutionCode: null };
    }
  }

  return { logicalPathname: pathname, redirectTo: null, setInstitutionCode: null };
}

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

/** Builds the base NextResponse for this request — a rewrite (institution
 *  URL prefix stripped internally, visible URL unchanged) or a plain
 *  pass-through, always carrying the CSP-nonce request headers and, when
 *  applicable, the active-institution cookie. Factored out because the
 *  Supabase session-refresh block below sometimes has to rebuild
 *  `response` from scratch (see its own comment) and must not lose either
 *  of those in the process. */
function buildBaseResponse(routing: InstitutionRouting, request: NextRequest, requestHeaders: Headers): NextResponse {
  let response: NextResponse;
  if (routing.logicalPathname !== request.nextUrl.pathname) {
    const url = request.nextUrl.clone();
    url.pathname = routing.logicalPathname;
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (routing.setInstitutionCode) {
    response.cookies.set(ACTIVE_INSTITUTION_COOKIE, routing.setInstitutionCode, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const routing = resolveInstitutionRouting(request);

  if (routing.redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = routing.redirectTo;
    return NextResponse.redirect(url);
  }

  const nonce = crypto.randomUUID();
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCsp(nonce, isDev);

  // Rate limiting — unchanged scope: only the specific POST endpoints
  // §X.1 names, checked before anything else, matched against the LOGICAL
  // (un-prefixed) path — see file header comment point 1.
  // checkRateLimit() is async because the Upstash-backed path
  // (services/rate-limit/rate-limiter.ts) makes a real REST call;
  // Next.js Edge middleware supports an async export natively, no other
  // change needed here.
  if (request.method === "POST") {
    const pathname = routing.logicalPathname;
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

  // §137 follow-up, found while verifying "can I install separate apps
  // now" live: response.cookies.set(ACTIVE_INSTITUTION_COOKIE, ...) below
  // (in buildBaseResponse) only changes what the BROWSER sends on its
  // NEXT request — it does nothing for THIS request's own render, since
  // services/request-context.ts's getRequestContext() reads the
  // institution code via next/headers' cookies(), which reflects the
  // INCOMING request, not a mutation this same middleware invocation made
  // to the outgoing response. Reproduced live: visiting /badrudhuja/login
  // in a browser that still carried an ACTIVE_INSTITUTION_COOKIE=mmp from
  // an earlier visit kept rendering MMP's title/manifest/branding on that
  // very first /badrudhuja/... request — exactly the scenario a genuinely
  // separate per-institution app needs to get right immediately, not on
  // a second visit. Fixed by rewriting the "cookie" REQUEST header itself
  // (not just the response) so the SAME request's downstream render sees
  // the correct value straight away.
  if (routing.setInstitutionCode) {
    const cookieHeader = request.cookies.getAll()
      .filter((c) => c.name !== ACTIVE_INSTITUTION_COOKIE)
      .concat([{ name: ACTIVE_INSTITUTION_COOKIE, value: routing.setInstitutionCode }])
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    requestHeaders.set("cookie", cookieHeader);
  }

  let response = buildBaseResponse(routing, request, requestHeaders);

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
            // so the rotated cookies actually reach the browser — via the
            // same buildBaseResponse() helper, so the rewrite/institution
            // cookie from above survive this rebuild too.
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = buildBaseResponse(routing, request, requestHeaders);
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
  // sitewide CSP needs the nonce on every HTML response, the rate
  // limiter's own RULES above still narrow which specific paths actually
  // get rate-limited, and resolveInstitutionRouting() above narrows
  // which paths participate in institution URL routing.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
