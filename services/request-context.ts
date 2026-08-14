/**
 * PROMPT EDU ERP — composed request context (ARCHITECTURE.md §A.4 request
 * lifecycle). This is the single entry point every server action / route
 * handler should call to find out "who is making this request, for which
 * institution, with which permissions" — nothing downstream re-derives or
 * overrides institution_id from client input.
 */
import { cookies } from "next/headers";
import { getAuthService } from "./auth/auth-service";
import { resolveActiveInstitution, resolveUserByAuthId, getMembershipsForUser } from "./tenant/tenant-service";
import { getPermissionsForUser, getAllInstitutionPermissionCodes } from "./permissions/permission-service";
import { getInstitutionForSuperAdmin } from "./super-admin/super-admin-service";
import { ACTIVE_INSTITUTION_COOKIE } from "./tenant/institution-cookie";
import type { RequestContext } from "../types/context";

/** Set only via setSuperAdminViewInstitution() below, from the "Open this
 *  institution's console" action on /super-admin/institutions/[id] —
 *  see RequestContext.viewingInstitutionAsSuperAdmin's own doc comment for
 *  the full rationale. */
const SUPER_ADMIN_VIEW_INSTITUTION_COOKIE = "perp_super_admin_view_institution_id";

/** Pure decision function, factored out for direct unit testing without
 *  needing next/headers' cookies() (which requires a real Next.js request
 *  context) — see tests/integration/institution-status-flow.test.ts. */
export function resolveInstitutionBlockedReason(
  institutionStatus: string | undefined,
  isSuperAdmin: boolean
): "suspended" | "inactive" | null {
  if (isSuperAdmin || !institutionStatus) return null;
  if (institutionStatus === "active" || institutionStatus === "trial") return null;
  return institutionStatus === "suspended" ? "suspended" : "inactive";
}

export async function getRequestContext(): Promise<RequestContext | null> {
  const auth = await getAuthService();
  const session = await auth.getSession();
  if (!session) return null;

  const resolvedUser = await resolveUserByAuthId(session.authUserId);
  if (!resolvedUser) return null; // authenticated with the provider, but no PROMPT EDU ERP user record yet

  const cookieStore = await cookies();
  const requestedCode = cookieStore.get(ACTIVE_INSTITUTION_COOKIE)?.value ?? null;

  const [active, memberships] = await Promise.all([
    resolveActiveInstitution(session.authUserId, resolvedUser.userId, requestedCode),
    getMembershipsForUser(session.authUserId, resolvedUser.userId),
  ]);

  // §W / SECURITY.md "institution deactivation has no cascading effect" —
  // now enforced here, the one place every server action/route handler's
  // institutionId/permissions ultimately come from. Super Admins are never
  // blocked (they're the ones who need to inspect/reactivate a suspended
  // institution via /super-admin) — everyone else gets treated exactly
  // like "no active institution" (institutionId/permissions stay
  // empty, so every existing permission check across the whole codebase
  // still fails closed with zero per-action changes needed) PLUS an
  // explicit reason the UI can surface instead of a bare redirect.
  const institutionBlockedReason = resolveInstitutionBlockedReason(active?.institutionStatus, resolvedUser.isSuperAdmin);

  let institutionId = institutionBlockedReason ? null : active?.institutionId ?? null;
  let viewingInstitutionAsSuperAdmin = false;

  // A "pure" Super Admin (§B.4) has no membership row anywhere, so `active`
  // above is always null for them — without this, (institution) routes are
  // permanently unreachable for a Super Admin, which is exactly the gap
  // that made "understand a module's real functionality by using it" mean
  // reading source code instead of clicking through the actual UI. Only
  // consulted when no REAL membership resolved, so this can never override
  // or shadow a genuine institution_admin's own institution.
  if (!institutionId && resolvedUser.isSuperAdmin) {
    const overrideInstitutionId = cookieStore.get(SUPER_ADMIN_VIEW_INSTITUTION_COOKIE)?.value ?? null;
    if (overrideInstitutionId) {
      const institution = await getInstitutionForSuperAdmin(session.authUserId, overrideInstitutionId);
      if (institution) {
        institutionId = institution.id;
        viewingInstitutionAsSuperAdmin = true;
      }
      // A stale cookie pointing at a deleted/inaccessible institution is
      // silently ignored (falls through to institutionId staying null)
      // rather than throwing — the same "fail closed, no crash" shape as
      // every other institutionId resolution path in this function.
    }
  }

  const permissions = !institutionId
    ? new Set<string>()
    : viewingInstitutionAsSuperAdmin
      // No role row of their own in this institution to derive permissions
      // from — grant the full catalogue, matching what RLS already allows
      // them unconditionally at the database layer (see this field's own
      // doc comment in types/context.ts).
      ? await getAllInstitutionPermissionCodes()
      : await getPermissionsForUser(session.authUserId, resolvedUser.userId, institutionId);

  return {
    session,
    userId: resolvedUser.userId,
    institutionId,
    isSuperAdmin: resolvedUser.isSuperAdmin,
    memberships,
    permissions,
    institutionBlockedReason,
    viewingInstitutionAsSuperAdmin,
  };
}

/** Throws (never silently falls through) if there is no authenticated context. */
export async function requireRequestContext(): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (!ctx) throw new Error("Unauthenticated");
  return ctx;
}

/** Guard for every (super-admin) page/server action (§B.4) — throws unless
 *  the authenticated user genuinely holds the platform-level super_admin
 *  role. Deliberately does NOT require ctx.institutionId to be set (a pure
 *  Super Admin with no institution membership of their own must still be
 *  able to reach the console) — services/super-admin/super-admin-service.ts
 *  independently re-verifies isSuperAdmin server-side again on every call,
 *  so this is the UI-layer half of a defense-in-depth pair, not the only check. */
export async function requireSuperAdminContext(): Promise<RequestContext> {
  const ctx = await requireRequestContext();
  if (!ctx.isSuperAdmin) throw new Error("Forbidden: this page requires the platform Super Admin role.");
  return ctx;
}

/** Called by the "switch institution" UI action — only ever re-derives from the user's OWN memberships (§B.3). */
export async function setActiveInstitutionCode(code: string) {
  const store = await cookies();
  store.set(ACTIVE_INSTITUTION_COOKIE, code, { httpOnly: true, sameSite: "lax", path: "/" });
}

/** Called only from the "Open this institution's console" action on
 *  /super-admin/institutions/[id] — re-verifies isSuperAdmin itself rather
 *  than trusting the caller, same defense-in-depth as every other
 *  Super-Admin-only write path in this codebase. */
export async function setSuperAdminViewInstitution(institutionId: string) {
  const ctx = await requireSuperAdminContext();
  const institution = await getInstitutionForSuperAdmin(ctx.session.authUserId, institutionId);
  if (!institution) throw new Error("Institution not found.");
  const store = await cookies();
  store.set(SUPER_ADMIN_VIEW_INSTITUTION_COOKIE, institutionId, { httpOnly: true, sameSite: "lax", path: "/" });
}

/** Called by the "Exit — back to Super Admin console" banner action, and by
 *  signOutAction (so a stray cookie never survives a sign-out/sign-in as a
 *  different account). */
export async function clearSuperAdminViewInstitution() {
  const store = await cookies();
  store.delete(SUPER_ADMIN_VIEW_INSTITUTION_COOKIE);
}
