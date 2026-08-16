/**
 * PROMPT EDU ERP — DevAuthProvider (local development / demo ONLY — see the
 * guard in auth-service.ts). Signs a user in by email with no password
 * check, storing their internal auth_user_id in an httpOnly cookie.
 *
 * This exists purely so Phase 0's exit-criterion flow ("Login → Institution
 * → Dashboard → Create class → … → View student") is runnable end-to-end
 * before a real Supabase project exists. It is NEVER wired to real
 * institution data in production (hard-blocked by auth-service.ts).
 *
 * signIn()/signUp() both ignore the password entirely and reuse the same
 * email-lookup devSignIn() flow — dev mode was always no-password by
 * design; these two methods exist only so DevAuthProvider satisfies the
 * same AuthService interface SupabaseAuthProvider does, letting
 * app/(auth)/login/actions.ts stay provider-agnostic rather than branching
 * on which provider is active.
 */
import { cookies } from "next/headers";
import type { AuthService, AuthResult } from "./auth-service";

const COOKIE_NAME = "perp_dev_auth_user_id";

export function createDevAuthProvider(): AuthService {
  return {
    async getSession(): Promise<AuthResult | null> {
      const store = await cookies();
      const authUserId = store.get(COOKIE_NAME)?.value;
      if (!authUserId) return null;
      return { authUserId, email: null };
    },

    async signIn(email: string, _password: string) {
      const authUserId = await devLookupAuthUserIdByEmail(email);
      if (!authUserId) {
        return { error: `No PROMPT EDU ERP user found for "${email}" in this local database.` };
      }
      await devSignIn(authUserId);
      return { authUserId, email };
    },

    async signUp(email: string, password: string) {
      // Dev mode has no real account-creation step — signUp() is just
      // signIn() with the session flag always true, so login/actions.ts's
      // shared flow works unmodified in dev mode too.
      const result = await this.signIn(email, password);
      if ("error" in result) return result;
      return { ...result, session: true };
    },

    async signOut() {
      const store = await cookies();
      store.delete(COOKIE_NAME);
    },

    async adminCreateUser(email, password) {
      // Dev mode is deliberately passwordless throughout (see file header)
      // — the password is accepted (so callers stay provider-agnostic) but
      // never checked or stored anywhere; a random id stands in for what
      // Supabase Auth would otherwise generate.
      void password;
      return { authUserId: crypto.randomUUID(), email };
    },

    async adminUpdatePassword(_authUserId, _password) {
      // No-op — same reasoning as adminCreateUser() above.
    },

    async adminDeleteUser(_authUserId) {
      // No-op: dev mode has no separate auth-account store to clean up —
      // devSignIn()/devLookupAuthUserIdByEmail() only ever look at `users`.
    },
  };
}

/** Used only by the dev login server action (app/(auth)/login). */
export async function devSignIn(authUserId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, authUserId, { httpOnly: true, sameSite: "lax", path: "/" });
}

/** Dev-only: look up a user's auth_user_id by email for the no-password dev
 * sign-in form (app/(auth)/login). Runs on the owner connection (not
 * app_user/RLS) since this IS the identity-establishing step — analogous to
 * how a real auth provider's login endpoint also runs outside tenant RLS. */
export async function devLookupAuthUserIdByEmail(email: string): Promise<string | null> {
  const { getDbClient } = await import("../db/client");
  const db = await getDbClient();
  const { rows } = await db.query<{ auth_user_id: string }>(
    "select auth_user_id from users where email = $1",
    [email]
  );
  return rows[0]?.auth_user_id ?? null;
}
