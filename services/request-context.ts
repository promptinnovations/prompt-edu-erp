/**
 * PROMPT EDU ERP — composed request context (ARCHITECTURE.md §A.4 request
 * lifecycle). This is the single entry point every server action / route
 * handler should call to find out "who is making this request, for which
 * institution, with which permissions" — nothing downstream re-derives or
 * overrides institution_id from client input.
 */
import { cookies, headers } from "next/headers";
import { getAuthService } from "./auth/auth-service";
import { resolveActiveInstitution, resolveUserByAuthId, getMembershipsForUser } from "./tenant/tenant-service";
import { getPermissionsForUser, getAllInstitutionPermissionCodes } from "./permissions/permission-service";
import { getInstitutionForSuperAdmin } from "./super-admin/super-admin-service";
import { getSamplePortalTarget } from "./super-admin/sample-portal-service";
import { ACTIVE_INSTITUTION_COOKIE } from "./tenant/institution-cookie";
import type { RequestContext } from "../types/context";

/** Set only via setSuperAdminViewInstitution() below, from the "Open this
 *  institution's console" action on /super-admin/institutions/[id] —
 *  see RequestContext.viewingInstitutionAsSuperAdmin's own doc comment for
 *  the full rationale. */
const SUPER_ADMIN_VIEW_INSTITUTION_COOKIE = "perp_super_admin_view_institution_id";

/** Set only via setSuperAdminViewAsUser() below, from the "View as" buttons
 *  on /super-admin/sample-portals — see RequestContext.viewingAsUser's own
 *  doc comment for the full rationale. Stores a small JSON payload; the
 *  userId/institutionId inside are re-verified fresh against the DB on
 *  EVERY request by getSamplePortalTarget() below — the cookie's own
 *  fullName/roleLabel are cosmetic-only (banner text), never trusted for
 *  any authorization decision (§X "never trust the client"). */
const SUPER_ADMIN_VIEW_AS_USER_COOKIE = "perp_super_admin_view_as_user";
interface SuperAdminViewAsUserCookie {
  userId: string;
  institutionId: string;
  roleLabel: string;
}

/** Pure decision function, factored out for direct unit testing without
 *  needing next/headers' cookies() (which requires a real Next.js request
 *  context) — see tests/integration/institution-status-flow.test.ts. */
/** Pure decision function (same "factor out for direct unit testing"
 *  reason as resolveInstitutionBlockedReason below) — true for
 *  "/super-admin" and every "/super-admin/..." pathname, false for
 *  everything else (institution app, portal app, auth pages). */
export function isSuperAdminConsoleRoute(pathname: string): boolean {
  return pathname === "/super-admin" || pathname.startsWith("/super-admin/");
}

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

  // "Sample Portals" follow-up ("add different sample portals ... chosen
  // from any institution, not fake data"): a Super Admin who is already
  // viewing an institution (above) can additionally pick a specific REAL
  // person there to act as, instead of the full-catalogue "super admin"
  // view — /super-admin/sample-portals' "View as Principal/Management/
  // Class Teacher/Student/Parent" buttons. Only ever consulted when
  // viewingInstitutionAsSuperAdmin is already true (never lets a real
  // institution_admin/teacher/etc. spoof a DIFFERENT real person — that
  // path never sets this cookie in the first place, see
  // setSuperAdminViewAsUser()'s own re-verification below).
  let effectiveUserId = resolvedUser.userId;
  let effectiveSession = session;
  let viewingAsUser: { userId: string; fullName: string; roleLabel: string } | null = null;
  // Never applies while the request itself IS a /super-admin/* page —
  // otherwise navigating back to the Super Admin console (browser back,
  // a stale tab, anything that doesn't go through exitSamplePortalAction/
  // exitSuperAdminViewAction first) would silently swap ctx.session.
  // authUserId to the "viewed as" person's real id, and every
  // SuperAdminService function's own independent isSuperAdmin
  // re-verification (services/super-admin/super-admin-service.ts's
  // withSuperAdminContext) would then throw "Forbidden" for THAT person —
  // reproduced live: GET /super-admin and /super-admin/sample-portals
  // both 500'd this way. Read from middleware.ts's x-pathname header
  // (institution-code prefix already stripped), not request.url, since
  // an institution-prefixed URL like /mmp/... would never match here.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isSuperAdminRoute = isSuperAdminConsoleRoute(pathname);
  if (institutionId && viewingInstitutionAsSuperAdmin && !isSuperAdminRoute) {
    const viewAsRaw = cookieStore.get(SUPER_ADMIN_VIEW_AS_USER_COOKIE)?.value ?? null;
    if (viewAsRaw) {
      try {
        const parsed = JSON.parse(viewAsRaw) as SuperAdminViewAsUserCookie;
        if (parsed.institutionId === institutionId && parsed.userId && parsed.roleLabel) {
          // Re-derives userId/authUserId/fullName fresh from the DB every
          // request (§X "never trust the client") — the cookie's own
          // userId is only a LOOKUP KEY here, roleLabel is cosmetic-only.
          const target = await getSamplePortalTarget(session.authUserId, institutionId, parsed.userId);
          if (target) {
            effectiveUserId = target.userId;
            effectiveSession = { authUserId: target.authUserId, email: target.email };
            viewingAsUser = { userId: target.userId, fullName: target.fullName, roleLabel: parsed.roleLabel };
          }
          // A stale cookie pointing at a person who lost their membership/
          // login since — same "fail closed, fall back silently" shape as
          // every other override cookie in this function — falls through
          // to the plain full-catalogue super-admin view below.
        }
      } catch {
        // Malformed cookie — ignore, same fallback.
      }
    }
  }

  const permissions = !institutionId
    ? new Set<string>()
    : viewingAsUser
      // A specific real person's OWN role-derived permissions — not the
      // full catalogue — so "View as Class Teacher" genuinely shows only
      // what a class teacher can do, not everything an admin can.
      ? await getPermissionsForUser(effectiveSession.authUserId, effectiveUserId, institutionId)
      : viewingInstitutionAsSuperAdmin
        // No role row of their own in this institution to derive permissions
        // from — grant the full catalogue, matching what RLS already allows
        // them unconditionally at the database layer (see this field's own
        // doc comment in types/context.ts).
        ? await getAllInstitutionPermissionCodes()
        : await getPermissionsForUser(session.authUserId, resolvedUser.userId, institutionId);

  return {
    session: effectiveSession,
    userId: effectiveUserId,
    institutionId,
    isSuperAdmin: resolvedUser.isSuperAdmin,
    memberships,
    permissions,
    institutionBlockedReason,
    viewingInstitutionAsSuperAdmin,
    viewingAsUser,
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
 *  different account). Also clears the "view as" cookie below — leaving
 *  the institution but keeping a stale "viewing as" identity around would
 *  otherwise resurrect it the next time this same institution is opened. */
export async function clearSuperAdminViewInstitution() {
  const store = await cookies();
  store.delete(SUPER_ADMIN_VIEW_INSTITUTION_COOKIE);
  store.delete(SUPER_ADMIN_VIEW_AS_USER_COOKIE);
}

/** Called only from the "View as Principal/Management/Class Teacher/
 *  Student/Parent" buttons on /super-admin/sample-portals — re-verifies
 *  isSuperAdmin AND that this userId genuinely has an active, real login
 *  in institutionId (via getSamplePortalTarget(), same re-verification
 *  getRequestContext() itself repeats on every subsequent request — this
 *  call is only the FIRST check, never the only one, per §X.2). Requires
 *  the institution-view cookie to already be set for this SAME
 *  institutionId — "view as" only ever narrows an already-opened
 *  institution, it never opens one on its own. */
export async function setSuperAdminViewAsUser(institutionId: string, userId: string, roleLabel: string) {
  const ctx = await requireSuperAdminContext();
  const institution = await getInstitutionForSuperAdmin(ctx.session.authUserId, institutionId);
  if (!institution) throw new Error("Institution not found.");
  const target = await getSamplePortalTarget(ctx.session.authUserId, institutionId, userId);
  if (!target) throw new Error("That person no longer has an active login in this institution.");
  const store = await cookies();
  store.set(SUPER_ADMIN_VIEW_INSTITUTION_COOKIE, institutionId, { httpOnly: true, sameSite: "lax", path: "/" });
  const payload: SuperAdminViewAsUserCookie = { userId, institutionId, roleLabel };
  store.set(SUPER_ADMIN_VIEW_AS_USER_COOKIE, JSON.stringify(payload), { httpOnly: true, sameSite: "lax", path: "/" });
}

/** Called by the "Exit sample portal" banner action (institution/portal
 *  layouts) — drops back to the plain full-catalogue "viewing this
 *  institution as Super Admin" state (task #138) rather than leaving the
 *  institution entirely, since that's almost always what someone browsing
 *  through several sample portals in a row wants next. */
export async function clearSuperAdminViewAsUser() {
  const store = await cookies();
  store.delete(SUPER_ADMIN_VIEW_AS_USER_COOKIE);
}
