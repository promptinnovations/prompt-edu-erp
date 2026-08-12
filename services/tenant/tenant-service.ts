/**
 * PROMPT EDU ERP — TenantService (ARCHITECTURE.md §B.3 "Tenant resolution
 * strategy").
 *
 * A user's institution_id is NEVER taken from the client (§E.3). This
 * service is the one place that resolves it, server-side, from the
 * authenticated session's verified membership rows — every server action
 * and route handler goes through here (or the composed
 * services/request-context.ts) rather than reading a client-supplied
 * institution id/header/cookie for authorization purposes. A subdomain or a
 * "switch institution" UI action may HINT which institution to pick, but the
 * hint is only ever used to select among the user's OWN verified
 * memberships — never to grant access to an institution the user isn't a
 * member of.
 */
import { getDbClient } from "../db/client";
import type { InstitutionMembership } from "../../types/context";

export interface ResolvedUser {
  userId: string;
  isSuperAdmin: boolean;
}

/** Looks up the internal `users` row for a given Supabase (or dev) auth id.
 *
 * Runs its super_admin check with isSuperAdmin=true in its OWN session
 * context (not a client-controlled value — this function's only input is
 * authUserId, resolved server-side from an already-verified auth session,
 * never from client-supplied data). This is deliberate, not a bypass of
 * the security model: `user_roles`/`roles` both carry the standard
 * tenant_isolation RLS policy (`institution_id = current institution OR
 * is_super_admin`), and this specific query has no "current institution"
 * to scope to — it's the one place that determines whether one even
 * EXISTS platform-wide. Without lifting row visibility for this read, a
 * genuine Super Admin's own user_roles row would always be invisible to
 * this exact check (their anchor institution_id, §D.2, is never the
 * caller's "current" one), making isSuperAdmin permanently unresolvable —
 * a real bug this fixes. Elevating visibility here cannot forge a result:
 * the WHERE clause still requires an actual matching row for this specific
 * authUserId; it only removes an RLS predicate that would otherwise hide a
 * TRUE result, never adds a false one. */
export async function resolveUserByAuthId(authUserId: string): Promise<ResolvedUser | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: null, authUserId, isSuperAdmin: true }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      "select id from users where auth_user_id = $1",
      [authUserId]
    );
    if (rows.length === 0) return null;

    const { rows: roleRows } = await scoped.query<{ code: string }>(
      `select r.code from user_roles ur
         join roles r on r.id = ur.role_id
        where ur.user_id = $1 and r.institution_id is null and r.code = 'super_admin'`,
      [rows[0].id]
    );

    return { userId: rows[0].id, isSuperAdmin: roleRows.length > 0 };
  });
}

/**
 * The bridge between "Supabase (or dev) Auth just verified this person
 * controls this email" and "this app actually knows who they are" — called
 * once, right after a successful AuthService.signIn()/signUp() (§AA
 * follow-up, real auth). Three outcomes, in order:
 *
 *   1. authUserId already linked (the common case, every login after the
 *      first) — resolves immediately via resolveUserByAuthId(), no writes.
 *   2. A `users` row exists for this VERIFIED email with `auth_user_id`
 *      still null (an institution admin/Super Admin pre-created the
 *      account via createStaffMember()/provisionStudentPortalAccount()/
 *      provisionParentPortalAccount()/createInstitution(), but nobody has
 *      ever signed into it for real yet) — this is the one-time "claim"
 *      step: link auth_user_id to it, then resolve normally. Trusting
 *      Supabase's verified email here (not a client-supplied claim) is
 *      what makes this safe — it is the same trust boundary every other
 *      part of this app already places in AuthService.getSession().
 *   3. Neither matches — refuse. Signing up with Supabase Auth alone NEVER
 *      grants app access to a previously-unknown email; a `users` row must
 *      already exist, created through the normal provisioning flows. This
 *      mirrors provisionStudentPortalAccount()'s own refusal to silently
 *      reuse/relink an already-claimed account (modules/portal/service.ts)
 *      — case 2 above only fires when auth_user_id is genuinely null, an
 *      already-linked row with a DIFFERENT auth_user_id is case 3, not 2.
 *
 * Runs with isSuperAdmin=true in its own session context for the same
 * documented reason resolveUserByAuthId() does (see that function's own
 * comment above) — there is no "current institution" to scope this to
 * yet, and elevating visibility/writability here cannot forge a result:
 * the lookup still requires a genuine matching row, and the only value
 * ever written is the authUserId the auth provider itself already
 * verified, never anything client-supplied.
 */
export async function linkOrResolveAuthenticatedUser(
  authUserId: string,
  email: string | null
): Promise<ResolvedUser> {
  const existing = await resolveUserByAuthId(authUserId);
  if (existing) return existing;

  if (!email) {
    throw new Error(
      "No PROMPT EDU ERP account exists for this sign-in yet, and no email was provided to look one up by. " +
        "Ask your institution admin to create your account first."
    );
  }

  const db = await getDbClient();
  const linked = await db.withInstitutionContext({ institutionId: null, authUserId, isSuperAdmin: true }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; auth_user_id: string | null }>(
      "select id, auth_user_id from users where lower(email) = lower($1)",
      [email]
    );
    if (rows.length === 0) return "not_found" as const;
    if (rows[0].auth_user_id) return "already_linked_elsewhere" as const;

    await scoped.query("update users set auth_user_id = $1, updated_at = now() where id = $2", [authUserId, rows[0].id]);
    return "linked" as const;
  });

  if (linked === "not_found") {
    throw new Error(
      `No PROMPT EDU ERP account exists for "${email}" yet. Ask your institution admin to create your account first.`
    );
  }
  if (linked === "already_linked_elsewhere") {
    throw new Error(`"${email}" is already linked to a different sign-in. Contact your administrator.`);
  }

  const resolved = await resolveUserByAuthId(authUserId);
  if (!resolved) {
    // Should be unreachable — the update above just linked this exact
    // authUserId — but fail loudly rather than returning an impossible null.
    throw new Error("Account linking succeeded but the account could not be re-resolved. Please try signing in again.");
  }
  return resolved;
}

/** All institutions this user belongs to (§B.3 step 2). */
export async function getMembershipsForUser(authUserId: string, userId: string): Promise<InstitutionMembership[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: null, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{
      institution_id: string;
      code: string;
      name: string;
      is_primary: boolean;
      institution_status: string;
    }>(
      `select m.institution_id, i.code, i.name, m.is_primary, i.status as institution_status
         from user_institution_memberships m
         join institutions i on i.id = m.institution_id
        where m.user_id = $1 and m.status = 'active'
        order by m.is_primary desc, i.name asc`,
      [userId]
    );
    return rows.map((r) => ({
      institutionId: r.institution_id,
      institutionCode: r.code,
      institutionName: r.name,
      isPrimary: r.is_primary,
      institutionStatus: r.institution_status,
    }));
  });
}

/**
 * Resolves the ACTIVE institution for this request: the requested code if
 * the user genuinely has a membership there, otherwise their primary
 * membership, otherwise their first membership, otherwise null (no
 * institution context — e.g. a pure Super Admin with no tenant membership).
 * This is the only function whose return value may be trusted as
 * `institution_id` for the rest of the request (§A.4/§E.1 Gate 1).
 */
export async function resolveActiveInstitution(
  authUserId: string,
  userId: string,
  requestedInstitutionCode?: string | null
): Promise<InstitutionMembership | null> {
  const memberships = await getMembershipsForUser(authUserId, userId);
  if (memberships.length === 0) return null;

  if (requestedInstitutionCode) {
    const match = memberships.find((m) => m.institutionCode === requestedInstitutionCode);
    if (match) return match; // only ever picks from the user's OWN verified memberships
  }
  return memberships.find((m) => m.isPrimary) ?? memberships[0];
}
