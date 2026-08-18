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
 * "Create a login" here mirrors modules/staff/service.ts's
 * createStaffLoginAccount()/resetStaffLoginPassword() pair (§137 follow-up:
 * "add and show current password of each user in the users & roles
 * section") — an admin sets a real, immediately-usable password up front
 * (via AuthService.adminCreateUser(), which also confirms the email, so
 * there's no "check your inbox to confirm" step blocking first sign-in),
 * rather than the earlier self-service "sign up yourself with this email"
 * placeholder design (users row created with auth_user_id = NULL, first
 * person to Supabase-sign-up with that email gets linked — see this file's
 * git history for that design's own original doc comment). The current
 * password is stored in `users.phone` — same reused field
 * modules/staff/service.ts and modules/portal/service.ts's student/staff
 * login flows already use for exactly this purpose (see
 * modules/attendance/service.ts:341's comment: "password IS the parent's
 * phone number, so users.phone doubles as..." — same convention, extended
 * here to every institution-created login, not just staff/students), so
 * "look up this person's current password" has one single place to check
 * regardless of which flow provisioned them.
 */
import { z } from "zod";
import { getDbClient } from "../db/client";
import type { DbClient } from "../db/client";
import { recordAudit } from "../audit/audit-service";
import { assertBelowLimit } from "../limits/limit-service";
import { getAuthService } from "../auth/auth-service";

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
  isClaimed: boolean; // auth_user_id is not null — this login is real and usable today
  membershipStatus: string; // active | inactive
  roleCodes: string[];
  roleNames: string[];
  currentPassword: string | null; // users.phone — see this file's header comment
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
      user_id: string; email: string | null; full_name: string; auth_user_id: string | null; status: string; phone: string | null;
    }>(
      `select u.id as user_id, u.email, u.full_name, u.auth_user_id, uim.status, u.phone
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
      currentPassword: m.phone,
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
  password: z.string().min(6).max(30),
  roleCodes: z.array(z.string().min(1)).min(1, "Select at least one role."),
});

/** Creates a REAL, immediately-usable login (auth account + confirmed
 *  email + `users` row) plus one or more role assignments — mirrors
 *  modules/staff/service.ts's createStaffLoginAccount() (server-set
 *  password, AuthService.adminCreateUser() confirms the email itself, so
 *  there's no "check your inbox" step blocking first sign-in), generalized
 *  to any role(s) rather than just staff. The auth account is created
 *  FIRST, then the `users` row references it — on any DB failure after
 *  that point the auth account is torn back down (same best-effort
 *  compensation createStaffLoginAccount()/createStudentLoginAccount() use),
 *  so a failed call never leaves an orphaned, unlinked auth account behind.
 *  Reusing an existing email for a second institution membership isn't
 *  supported here either, for the same reason createStaffMember() doesn't. */
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

    const authService = await getAuthService();
    const authResult = await authService.adminCreateUser(data.email, data.password);
    if ("error" in authResult) {
      throw new Error(`Could not create the login (${authResult.error}).`);
    }

    const newUserId = crypto.randomUUID();
    try {
      try {
        await scoped.query(
          `insert into users (id, auth_user_id, email, phone, full_name, preferred_locale)
           values ($1, $2, $3, $4, $5, 'en')`,
          [newUserId, authResult.authUserId, data.email, data.password, data.fullName]
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
    } catch (err) {
      await authService.adminDeleteUser(authResult.authUserId).catch(() => {});
      throw err;
    }
  });
}

const setPasswordSchema = z.object({ password: z.string().min(6).max(30) });

/** Sets (or resets) a login's password — works whether the target already
 *  has a real auth account (the common case: reset, e.g. "these two staff
 *  accounts can't be accessed currently" — the fix is the admin looking up
 *  and/or resetting the password right here) or is still an older-style
 *  claimable placeholder from before this feature existed (auth_user_id
 *  still null — creates the real account now, same as createInstitutionUser()
 *  above does for a brand new one). Either way, the plaintext password ends
 *  up in `users.phone` for display (see this file's header comment) via the
 *  same set_login_credentials() SECURITY DEFINER function
 *  modules/staff/service.ts already relies on for the identical "plain
 *  UPDATE silently affects 0 rows under RLS" reason (migration 0025's own
 *  doc comment). */
export async function setUserPassword(
  institutionId: string,
  authUserId: string,
  actingUserId: string,
  targetUserId: string,
  input: z.infer<typeof setPasswordSchema>
): Promise<void> {
  const data = setPasswordSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ email: string | null; auth_user_id: string | null }>(
      `select u.email, u.auth_user_id from user_institution_memberships uim
         join users u on u.id = uim.user_id
        where uim.user_id = $1 and uim.institution_id = $2`,
      [targetUserId, institutionId]
    );
    if (rows.length === 0) throw new Error("User not found at this institution.");
    const { email, auth_user_id } = rows[0];

    const authService = await getAuthService();
    if (auth_user_id) {
      const result = await authService.adminUpdatePassword(auth_user_id, data.password);
      if (result && "error" in result) throw new Error(`Could not set the password (${result.error}).`);
      await scoped.query("select set_login_credentials($1, null, $2)", [targetUserId, data.password]);
    } else {
      if (!email) throw new Error("This user has no email on file.");
      const authResult = await authService.adminCreateUser(email, data.password);
      if ("error" in authResult) throw new Error(`Could not create the login (${authResult.error}).`);
      const { rows: setRows } = await scoped.query<{ set_login_credentials: boolean }>(
        "select set_login_credentials($1, $2, $3) as set_login_credentials",
        [targetUserId, authResult.authUserId, data.password]
      );
      if (!setRows[0]?.set_login_credentials) {
        await authService.adminDeleteUser(authResult.authUserId).catch(() => {});
        throw new Error("Could not link the new login to this user's account.");
      }
    }

    await recordAudit(scoped, {
      institutionId, userId: actingUserId, action: "set_password", module: "users", entityType: "users", entityId: targetUserId,
    });
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
