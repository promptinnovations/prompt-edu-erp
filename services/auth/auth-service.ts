/**
 * PROMPT EDU ERP — AuthService abstraction (ARCHITECTURE.md §A.5 "Auth,
 * abstracted behind an AuthService", §X "never trust the client").
 *
 * Two providers implement the same interface:
 *   - SupabaseAuthProvider — real auth via Supabase Auth (§AA follow-up:
 *     now built on `@supabase/ssr`'s createServerClient, which correctly
 *     manages Supabase's session cookie refresh lifecycle in the Next.js
 *     App Router — the placeholder manual cookie/JWT handling this
 *     replaced is documented in that file's own header comment history).
 *     Used whenever NEXT_PUBLIC_SUPABASE_URL + SUPABASE keys are
 *     configured. This is what production/Badrudhuja actually runs on.
 *   - DevAuthProvider      — a minimal, cookie-based, NO-PASSWORD sign-in
 *     used only when Supabase credentials are absent, so the Phase 0
 *     foundation flow (Login → Dashboard → Create class → … → View student)
 *     is runnable and demonstrable with zero external accounts. It is hard-
 *     blocked from running in a real production environment (see guard
 *     below) — it exists for local development and this repository's own
 *     `npm run dev` walkthrough only, never for a real institution's data.
 *
 * signIn()/signUp() authenticate against the auth backend itself (proving
 * "this person controls this email") but deliberately do NOT decide
 * whether that email is allowed into this app — see
 * services/tenant/tenant-service.ts's linkOrResolveAuthenticatedUser(),
 * called by the login action right after a successful signIn()/signUp(),
 * which is the one place that decision is made (a users row must already
 * exist, created by an institution admin/Super Admin through the normal
 * staff/student/parent-provisioning flows — signing up with Supabase Auth
 * alone never grants app access to a previously-unknown email).
 *
 * No application code above this file ever calls a Supabase SDK function
 * directly — everything goes through this interface, which is what makes the
 * later Neon/self-hosted migration (§V) a config change, not a rewrite.
 */

export interface AuthResult {
  authUserId: string;
  email: string | null;
}

export interface AuthService {
  getSession(): Promise<AuthResult | null>;
  /** Returns the authenticated identity on success. On failure, returns a
   *  user-facing error message rather than throwing — invalid credentials
   *  are an expected, common outcome, not an exceptional one. */
  signIn(email: string, password: string): Promise<AuthResult | { error: string }>;
  /** Creates the underlying auth-provider account. Not every provider
   *  requires a confirmation step before a session exists (Supabase's
   *  email-confirmation setting is a per-project toggle) — `session: false`
   *  means the account was created but the caller must confirm (e.g. via
   *  email) before signIn() will succeed. */
  signUp(email: string, password: string): Promise<(AuthResult & { session: boolean }) | { error: string }>;
  signOut(): Promise<void>;
  /** Server-side account creation with an EXPLICIT password and an
   *  immediately-confirmed email — the one deliberate, narrowly-scoped
   *  exception to "nobody's password ever passes through this app's
   *  server" (every other account creation path is self-service signUp()).
   *  Used only by services/super-admin/super-admin-service.ts's
   *  createInstitution(), for the same reason almost every real admin
   *  console needs SOME way to bootstrap a brand new tenant's first login
   *  without an extra "please go sign up yourself" round trip. */
  adminCreateUser(email: string, password: string): Promise<AuthResult | { error: string }>;
  /** Best-effort compensation for the specific case where adminCreateUser()
   *  succeeded but a LATER step in the same logical operation then failed
   *  (e.g. the institution's DB rows couldn't be created) — never called on
   *  any other path. Callers swallow this method's own failures: an
   *  orphaned auth account with no linked institution/users row is a
   *  cosmetic leftover, not a security or data-integrity problem. */
  adminDeleteUser(authUserId: string): Promise<void>;
}

export async function getAuthService(): Promise<AuthService> {
  const hasSupabaseConfig =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (hasSupabaseConfig) {
    // Lazily imported so the dev/test path never needs @supabase/supabase-js
    // configured with real credentials. A dynamic import() (rather than the
    // earlier lazy require()) — Next.js's webpack bundler happily resolved
    // require() here, but that same relative require() fails to resolve
    // under vitest's vite-node ESM execution (surfaced the first time an
    // integration test actually exercised this function, rather than only
    // ever being reached through a real Next.js request) — import() works
    // identically in both.
    const { createSupabaseAuthProvider } = await import("./supabase-auth-provider");
    return createSupabaseAuthProvider();
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_AUTH !== "true") {
    throw new Error(
      "AuthService: no Supabase credentials configured and dev auth is disabled in production. " +
        "Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, or explicitly set ALLOW_DEV_AUTH=true " +
        "only if you understand this bypasses real authentication (never for real institution data)."
    );
  }

  const { createDevAuthProvider } = await import("./dev-auth-provider");
  return createDevAuthProvider();
}
