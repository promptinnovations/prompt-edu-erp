/**
 * PROMPT EDU ERP — SupabaseAuthProvider (production auth backend, §T/§V).
 *
 * Built on `@supabase/ssr`'s createServerClient, the framework-recommended
 * way to wire Supabase Auth into the Next.js App Router — it manages the
 * session cookie refresh lifecycle correctly (rotating tokens, multiple
 * cookie chunks, etc.) instead of the earlier Phase 0 placeholder that
 * manually read/deleted two hardcoded cookie names. See that placeholder's
 * own doc comment (preserved in auth-service.ts's history) for why it was
 * intentionally minimal at the time.
 *
 * getSession() calls `supabase.auth.getUser()`, NOT `getSession()` — this
 * is deliberate and matches Supabase's own documented server-side guidance:
 * getUser() revalidates the token against the Supabase Auth server on every
 * call, while getSession() only decodes the local cookie and can be spoofed
 * by a tampered cookie value in a server context. The extra network round
 * trip is the correct trade for a security-sensitive check.
 *
 * The anon key (not the service role key) is used for the end-user-facing
 * client below — sign-in/sign-up/session-read all run as the authenticated
 * (or anonymous) user through Supabase's own RLS on its `auth` schema,
 * exactly as Supabase's docs intend. The service role key is reserved for
 * services/super-admin's cross-tenant reads and is never used here.
 */
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { AuthService, AuthResult } from "./auth-service";

/** Service-role client for the one deliberate admin-privileged path
 *  (adminCreateUser/adminDeleteUser below) — same key, same
 *  createClient() call shape as services/storage/supabase-storage-
 *  provider.ts, kept separate from getSupabaseClient() above since that
 *  one is deliberately anon-key-only (see this file's own header comment
 *  on why). Never used for anything except the Super Admin "create
 *  institution + admin account" flow. */
function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceRoleKey);
}

async function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const store = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        // Server Actions/Route Handlers can mutate cookies; a plain Server
        // Component render cannot (Next.js throws) — getSession() is also
        // called from layouts during a normal page render, so this must
        // not blow up that path. A plain render simply can't rotate an
        // expired access token itself in that case — but it doesn't need
        // to: middleware.ts now refreshes the session (via its own
        // createServerClient, ahead of every request) before any layout
        // or Server Component even runs, so by the time getSession() is
        // called here the cookie is already current. This try/catch stays
        // as a defensive no-op for the (now rare) case getSession() is
        // ever called somewhere middleware didn't run first.
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Ignored — see comment above.
        }
      },
    },
  });
}

export function createSupabaseAuthProvider(): AuthService {
  return {
    async getSession(): Promise<AuthResult | null> {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return { authUserId: data.user.id, email: data.user.email ?? null };
    },

    async signIn(email, password) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        return { error: error?.message ?? "Sign-in failed." };
      }
      return { authUserId: data.user.id, email: data.user.email ?? null };
    },

    async signUp(email, password) {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error || !data.user) {
        return { error: error?.message ?? "Sign-up failed." };
      }
      // A non-null session means the Supabase project has email
      // confirmation OFF (or it was already confirmed) — the account is
      // immediately usable. A null session means a confirmation email was
      // sent and signIn() will fail until the user clicks it.
      return { authUserId: data.user.id, email: data.user.email ?? null, session: data.session !== null };
    },

    async signOut() {
      const supabase = await getSupabaseClient();
      await supabase.auth.signOut();
    },

    async adminCreateUser(email, password) {
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) {
        return { error: error?.message ?? "Failed to create account." };
      }
      return { authUserId: data.user.id, email: data.user.email ?? null };
    },

    async adminDeleteUser(authUserId) {
      const admin = getSupabaseAdminClient();
      try {
        await admin.auth.admin.deleteUser(authUserId);
      } catch {
        // Best-effort compensation only — see this method's own doc
        // comment on auth-service.ts's AuthService interface.
      }
    },
  };
}
