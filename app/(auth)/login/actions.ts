"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthService } from "../../../services/auth/auth-service";
import { linkOrResolveAuthenticatedUser, resolveActiveInstitution } from "../../../services/tenant/tenant-service";
import { getRoleCodesForUser } from "../../../services/permissions/permission-service";
import { resolvePortalDestination, resolveStudentLoginEmail } from "../../../modules/portal/service";
import { getInstitutionPublicSummaryByCode } from "../../../services/institution/institution-service";
import { ACTIVE_INSTITUTION_COOKIE } from "../../../services/tenant/institution-cookie";

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
  let email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const intent = String(formData.get("intent") ?? "signin");

  // §137 follow-up ("their log in id (must be student name, password- phone
  // number of parent)") — the "Student login" tab on LoginForm.tsx submits a
  // name (not an email) plus intent="student_signin"; resolve it, server-side,
  // to the synthetic email that account was actually provisioned with (see
  // modules/portal/service.ts's createStudentLoginAccount()/
  // resolveStudentLoginEmail()) BEFORE falling into the exact same
  // AuthService.signIn() + linkOrResolveAuthenticatedUser() flow every other
  // sign-in already uses below — nothing downstream of this block needs to
  // know a name-based login even happened.
  if (intent === "student_signin") {
    const studentLoginId = String(formData.get("studentLoginId") ?? "").trim();
    if (!studentLoginId) return { error: "Student name is required.", info: null };
    if (!password) return { error: "Password is required.", info: null };
    const store = await cookies();
    const institutionCode = store.get(ACTIVE_INSTITUTION_COOKIE)?.value ?? null;
    if (!institutionCode) {
      return { error: "Open your institution's own login link first (ask your school office for it).", info: null };
    }
    const resolved = await resolveStudentLoginEmail(institutionCode, studentLoginId).catch(() => null);
    if (!resolved) {
      return { error: "No student login found with that name here. Check the spelling, or contact the school office.", info: null };
    }
    email = resolved.email;
  }

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

  // §137 follow-up ("no other login should be allowed there") — a real
  // auth account/password succeeding is not enough on an institution's OWN
  // /<code>/login: it must also be an account that institution actually
  // gave a membership to, or the "separate app per institution" promise
  // (see services/branding/app-identity.ts) is just skin-deep — anyone
  // could type ANY institution's staff credentials into mmp's installed
  // app and land in their own, completely different institution's
  // dashboard instead of being told "wrong place". resolveActiveInstitution()
  // already supports resolving by a specific requested code (used correctly
  // below); passing the active-institution cookie's code here — rather than
  // null, as before — lets us tell "this exact institution" apart from
  // "some institution or other the account happens to belong to". Exempt
  // Super Admins (§super-admin-flow) — they legitimately have no ordinary
  // institution membership at all and are routed to /super-admin below
  // regardless of which /<code>/login they used.
  const store = await cookies();
  const institutionCode = store.get(ACTIVE_INSTITUTION_COOKIE)?.value ?? null;
  const active = await resolveActiveInstitution(session.authUserId, resolvedUser.userId, institutionCode);
  if (institutionCode && !resolvedUser.isSuperAdmin && active?.institutionCode !== institutionCode) {
    await authService.signOut();
    const institution = await getInstitutionPublicSummaryByCode(institutionCode).catch(() => null);
    const institutionLabel = institution?.appName || institution?.name || "this institution";
    return {
      error: `This account isn't registered with ${institutionLabel}. If you meant to sign in to a different institution, use that institution's own link instead.`,
      info: null,
    };
  }

  // §Z routing: a pure student/parent role goes to their portal, not the
  // general admin app — resolved once, here, rather than relying on every
  // institution-admin page to individually guard against the wrong
  // audience (the (institution) layout also re-checks this on every
  // request, §X defense in depth — this is just the common-case shortcut).
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
