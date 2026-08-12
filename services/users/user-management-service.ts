/**
 * PROMPT EDU ERP — UserManagementService (§F "system role templates",
 * ARCHITECTURE.md's own design already supports a user holding MULTIPLE
 * roles at one institution — user_roles' unique constraint is
 * (user_id, institution_id, role_id), not (user_id, institution_id) — this
 * is the first thing that actually exposes that to an Institution Admin
 * through the UI instead of only database/scripts/seed.ts.
 *
 * Every mutating function here is permission-gated by the CALLER
 * (app/(institution)/users/actions.ts, via requirePermission — "users.manage"
 * to create/deactivate a user, "roles.manage" to change role assignments),
 * exactly like every other institution-scoped service in this codebase
 * (modules/staff/service.ts's createStaffMember, etc.) — this file does not
 * re-check permissions itself, only institution scoping (via
 * withInstitutionContext) and RLS (§E Gate 2).
 *
 * "Generate a login" here means the same thing seed.ts's `claimable: true`
 * accounts mean: a users row is created with auth_user_id = NULL, and the
 * first real person to sign up via Supabase Auth with that SAME email gets
 * linked to it automatically (linkOrResolveAuthenticatedUser(), services/
 * tenant/tenant-service.ts) — nobody's password ever passes through this
 * app's server, by design (§X).
 */
import { z } from "zod";
import { getDbClient } from "../db/client";
import type { DbClient } from "../db/client";
import { recordAudit } from "../audit/audit-service";
import { assertBelowLimit } from "../limits/limit-service";

export interface InstitutionRoleOption {
  id: string;
  code: string;
  name: string;
  isSystemRole: boolean;
}

export interface InstitutionUserRow {
  userId: string;
  email: string | null;
  fullName: string;
  isClaimed: boolean; // auth_user_id is not null — someone has actually signed in as this account
  membershipStatus: string; // active | inactive
  roleCodes: string[];
  roleNames: string[];
}

export async function listInstitutionRoles(institutionId: string, authUserId: string): Promise<InstitutionRoleOption[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; code: string; name: string; is_system_role: boolean }>(
      `select id, code, name, is_system_role from roles where institution_id = $1 order by name`,
      [institutionId]
    );
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, isSystemRole: r.is_system_role }));
  });
}

export async function listInstitutionUsers(institutionId: string, authUserId: string): Promise<InstitutionUserRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: memberRows } = await scoped.query<{
      user_id: string; email: string | null; full_name: string; auth_user_id: string | null; status: string;
    }>(
      `select u.id as user_id, u.email, u.full_name, u.auth_user_id, uim.status
         from user_institution_memberships uim
         join users u on u.id = uim.user_id
        where uim.institution_id = $1
        order by u.full_name`,
      [institutionId]
    );

    const { rows: roleRows } = await scoped.query<{ user_id: string; code: string; name: string }>(
      `select ur.user_id, r.code, r.name
         from user_roles ur
         join roles r on r.id = ur.role_id
        where ur.institution_id = $1`,
      [institutionId]
    );
    const rolesByUser = new Map<string, { codes: string[]; names: string[] }>();
    for (const r of roleRows) {
      const entry = rolesByUser.get(r.user_id) ?? { codes: [], names: [] };
      entry.codes.push(r.code);
      entry.names.push(r.name);
      rolesByUser.set(r.user_id, entry);
    }

    return memberRows.map((m) => ({
      userId: m.user_id,
      email: m.email,
      fullName: m.full_name,
      isClaimed: m.auth_user_id !== null,
      membershipStatus: m.status,
      roleCodes: rolesByUser.get(m.user_id)?.codes ?? [],
      roleNames: rolesByUser.get(m.user_id)?.names ?? [],
    }));
  });
}

async function resolveRoleIds(scoped: DbClient, institutionId: string, roleCodes: string[]): Promise<string[]> {
  if (roleCodes.length === 0) return [];
  const { rows } = await scoped.query<{ id: string; code: string }>(
    `select id, code from roles where institution_id = $1 and code = any($2::text[])`,
    [institutionId, roleCodes]
  );
  const found = new Set(rows.map((r) => r.code));
  const missing = roleCodes.filter((c) => !found.has(c));
  if (missing.length > 0) {
    throw new Error(`Unknown role code(s) for this institution: ${missing.join(", ")}.`);
  }
  return rows.map((r) => r.id);
}

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
  roleCodes: z.array(z.string().min(1)).min(1, "Select at least one role."),
});

/** Creates a claimable login (auth_user_id NULL) plus one or more role
 *  assignments, in one transaction — mirrors modules/staff/service.ts's
 *  createStaffMember() exactly (same RLS-driven "no ON CONFLICT, no
 *  RETURNING on the initial insert, generate the id client-side" shape —
 *  see that file's own comment for why), generalized to any role(s) rather
 *  than just staff. Reusing an existing email for a second institution
 *  membership isn't supported here either, for the same reason. */
export async function createInstitutionUser(
  institutionId: string,
  authUserId: string,
  actingUserId: string,
  input: z.infer<typeof createUserSchema>
): Promise<{ userId: string }> {
  const data = createUserSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await assertBelowLimit(scoped, institutionId, "users");

    const roleIds = await resolveRoleIds(scoped, institutionId, data.roleCodes);

    const newUserId = crypto.randomUUID();
    try {
      await scoped.query(
        `insert into users (id, auth_user_id, email, full_name, preferred_locale) values ($1, null, $2, $3, 'en')`,
        [newUserId, data.email, data.fullName]
      );
    } catch {
      throw new Error(`A user with email "${data.email}" already exists — reusing an existing account for a new login isn't supported yet.`);
    }

    await scoped.query(
      `insert into user_institution_memberships (user_id, institution_id, status, is_primary)
       values ($1, $2, 'active', false)
       on conflict (user_id, institution_id) do nothing`,
      [newUserId, institutionId]
    );

    for (const roleId of roleIds) {
      await scoped.query(
        `insert into user_roles (user_id, institution_id, role_id) values ($1, $2, $3) on conflict do nothing`,
        [newUserId, institutionId, roleId]
      );
    }

    await recordAudit(scoped, {
      institutionId, userId: actingUserId, action: "create", module: "users", entityType: "users", entityId: newUserId,
      after: { email: data.email, fullName: data.fullName, roleCodes: data.roleCodes },
    });
    return { userId: newUserId };
  });
}

const updateRolesSchema = z.object({ roleCodes: z.array(z.string().min(1)) });

/** Replaces the FULL set of role assignments for one user at this
 *  institution (checkbox-list UI, not additive) — a user can legitimately
 *  hold several roles at once (e.g. teacher + librarian), so this is a set
 *  operation, not a single-value update. Blocks a caller from changing
 *  their OWN role assignments through this screen (simplest guard against
 *  accidental self-lockout — an institution needs at least one OTHER
 *  admin to change a given admin's roles). */
export async function updateUserRoles(
  institutionId: string,
  authUserId: string,
  actingUserId: string,
  targetUserId: string,
  input: z.infer<typeof updateRolesSchema>
): Promise<void> {
  if (targetUserId === actingUserId) {
    throw new Error("You can't change your own role assignments here — ask another institution admin.");
  }
  const data = updateRolesSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const roleIds = await resolveRoleIds(scoped, institutionId, data.roleCodes);

    const { rows: before } = await scoped.query<{ code: string }>(
      `select r.code from user_roles ur join roles r on r.id = ur.role_id
        where ur.user_id = $1 and ur.institution_id = $2`,
      [targetUserId, institutionId]
    );

    if (roleIds.length > 0) {
      await scoped.query(
        `delete from user_roles where user_id = $1 and institution_id = $2 and role_id <> all($3::uuid[])`,
        [targetUserId, institutionId, roleIds]
      );
    } else {
      await scoped.query(`delete from user_roles where user_id = $1 and institution_id = $2`, [targetUserId, institutionId]);
    }
    for (const roleId of roleIds) {
      await scoped.query(
        `insert into user_roles (user_id, institution_id, role_id) values ($1, $2, $3) on conflict do nothing`,
        [targetUserId, institutionId, roleId]
      );
    }

    await recordAudit(scoped, {
      institutionId, userId: actingUserId, action: "update", module: "users", entityType: "user_roles", entityId: targetUserId,
      before: { roleCodes: before.map((r) => r.code) }, after: { roleCodes: data.roleCodes },
    });
  });
}

const membershipStatusSchema = z.object({ status: z.enum(["active", "inactive"]) });

/** Deactivating never deletes the account or its role assignments — it only
 *  flips user_institution_memberships.status, so re-activating restores
 *  everything exactly as it was (mirrors institutions.status's own
 *  non-destructive design, §W). */
export async function setUserMembershipStatus(
  institutionId: string,
  authUserId: string,
  actingUserId: string,
  targetUserId: string,
  input: z.infer<typeof membershipStatusSchema>
): Promise<void> {
  if (targetUserId === actingUserId) {
    throw new Error("You can't deactivate your own account here — ask another institution admin.");
  }
  const data = membershipStatusSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ status: string }>(
      `select status from user_institution_memberships where user_id = $1 and institution_id = $2`,
      [targetUserId, institutionId]
    );
    await scoped.query(
      `update user_institution_memberships set status = $1 where user_id = $2 and institution_id = $3`,
      [data.status, targetUserId, institutionId]
    );
    await recordAudit(scoped, {
      institutionId, userId: actingUserId, action: "status_change", module: "users", entityType: "user_institution_memberships", entityId: targetUserId,
      before: { status: before[0]?.status ?? "active" }, after: { status: data.status },
    });
  });
}
