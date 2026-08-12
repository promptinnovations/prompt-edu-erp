"use server";

import { redirect } from "next/navigation";
import { getAuthService } from "../../../services/auth/auth-service";
import { linkOrResolveAuthenticatedUser, resolveActiveInstitution } from "../../../services/tenant/tenant-service";
import { getRoleCodesForUser } from "../../../services/permissions/permission-service";
import { resolvePortalDestination } from "../../../modules/portal/service";

export interface LoginState {
  error: string | null;
  info: string | null;
}

/**
 * Provider-agnostic (§AA follow-up, real auth): works identically whether
 * AuthService.getAuthService() returns SupabaseAuthProvider or
 * DevAuthProvider — this file has no branching on which one is active,
 * that's the whole point of the AuthService abstraction (see
 * services/auth/auth-service.ts's header comment).
 *
 * `intent` distinguishes "sign in" (an existing auth-provider account) from
 * "sign up" (create one) — both still require a matching, already-existing
 * `users` row before app access is granted; see
 * linkOrResolveAuthenticatedUser()'s own doc comment for the full
 * three-outcome design.
 */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const intent = String(formData.get("intent") ?? "signin");
  if (!email) return { error: "Email is required.", info: null };

  const authService = await getAuthService();

  if (intent === "signup") {
    if (password.length < 8) return { error: "Password must be at least 8 characters.", info: null };
    const result = await authService.signUp(email, password);
    if ("error" in result) return { error: result.error, info: null };
    if (!result.session) {
      // Email confirmation is required before signIn() will work — nothing
      // more to do this request; the account isn't linked into `users` yet
      // either, that happens on the FIRST successful signIn() after
      // confirmation, same as any other first-time sign-in.
      return { error: null, info: "Check your email to confirm your account, then sign in." };
    }
    // Confirmation disabled (or already confirmed) — session exists
    // immediately, so continue exactly like a normal sign-in below.
  } else {
    const result = await authService.signIn(email, password);
    if ("error" in result) return { error: result.error, info: null };
  }

  const session = await authService.getSession();
  if (!session) return { error: "Sign-in succeeded but no session was established. Please try again.", info: null };

  let resolvedUser;
  try {
    resolvedUser = await linkOrResolveAuthenticatedUser(session.authUserId, session.email ?? email);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resolve your account.", info: null };
  }

  // §Z routing: a pure student/parent role goes to their portal, not the
  // general admin app — resolved once, here, rather than relying on every
  // institution-admin page to individually guard against the wrong
  // audience (the (institution) layout also re-checks this on every
  // request, §X defense in depth — this is just the common-case shortcut).
  const active = await resolveActiveInstitution(session.authUserId, resolvedUser.userId, null);
  if (active) {
    const roleCodes = await getRoleCodesForUser(session.authUserId, resolvedUser.userId, active.institutionId);
    const destination = resolvePortalDestination(roleCodes);
    if (destination === "student") redirect("/portal/student");
    if (destination === "parent") redirect("/portal/parent");
  } else if (resolvedUser.isSuperAdmin) {
    // A "pure" Super Admin with no institution membership of their own
    // (§B.4) has nowhere to land in (institution) — which redirects back
    // to /login without one — so send them straight to their own console
    // instead of into that loop.
    redirect("/super-admin");
  }

  redirect("/dashboard");
}
