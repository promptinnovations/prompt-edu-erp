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
import type { AuthService } from "../auth/auth-service";
import { sortRoster } from "../academic/roster-order";

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

/** §users-roles follow-up ("Staff and Students list should be separated")
 *  -- root cause was listInstitutionUsers() above lumping every
 *  user_institution_memberships row together: institution_admin/teacher/
 *  other staff AND every student/parent portal login (Phase 12 gives both
 *  a real users row + membership), sorted only alphabetically with no
 *  class/roll-number grouping at all. Split into this (everyone WITHOUT
 *  the 'student' or 'parent' role) and listStudentUsersWithParent() below
 *  (student rows, each paired with its own parent's login) rather than
 *  filtering listInstitutionUsers()'s output client-side, so RLS/institution
 *  scoping stays in one query per table like every other list function in
 *  this codebase. */
export async function listStaffUsers(institutionId: string, authUserId: string): Promise<InstitutionUserRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: memberRows } = await scoped.query<{
      user_id: string; email: string | null; full_name: string; auth_user_id: string | null; status: string; phone: string | null;
    }>(
      `select u.id as user_id, u.email, u.full_name, u.auth_user_id, uim.status, u.phone
         from user_institution_memberships uim
         join users u on u.id = uim.user_id
        where uim.institution_id = $1
          and not exists (
            select 1 from user_roles ur join roles r on r.id = ur.role_id
             where ur.user_id = u.id and ur.institution_id = $1 and r.code in ('student', 'parent')
          )
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

export interface StudentUserRow extends InstitutionUserRow {
  studentId: string;
  className: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  /** Primary contact parent's OWN login (student_parents.is_primary_contact
   *  desc, same "which parent" resolution listStudentsForAdmin() already
   *  uses) -- null when the student has no linked parent account yet. */
  parent: {
    userId: string;
    fullName: string;
    isClaimed: boolean;
    membershipStatus: string;
    currentPassword: string | null;
  } | null;
}

/** The Students table on Users & Roles -- one row per student LOGIN
 *  (students.user_id), in the same section (stage) -> GRADE -> division ->
 *  roll number order every other student list/dropdown now follows
 *  (§users-roles follow-up), with that student's own parent login attached
 *  inline rather than as a separate, unrelated row elsewhere in the table. */
export async function listStudentUsersWithParent(institutionId: string, authUserId: string): Promise<StudentUserRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{
      user_id: string; email: string | null; full_name: string; auth_user_id: string | null; status: string; phone: string | null;
      student_id: string; gender: string | null; stage: string | null; class_name: string | null; section_name: string | null; roll_number: number | null;
      parent_user_id: string | null; parent_full_name: string | null; parent_auth_user_id: string | null; parent_status: string | null; parent_phone: string | null;
    }>(
      `select u.id as user_id, u.email, u.full_name, u.auth_user_id, uim.status, u.phone,
              s.id as student_id, s.gender, c.stage, c.name as class_name, sec.name as section_name, se.roll_number,
              pu.id as parent_user_id, pu.full_name as parent_full_name, pu.auth_user_id as parent_auth_user_id,
              puim.status as parent_status, pu.phone as parent_phone
         from user_institution_memberships uim
         join users u on u.id = uim.user_id
         join students s on s.user_id = u.id
         left join student_enrollments se
           on se.student_id = s.id and se.status = 'active'
          and se.academic_year_id = (select id from academic_years where institution_id = $1 and is_current = true limit 1)
         left join classes c on c.id = se.class_id
         left join sections sec on sec.id = se.section_id
         left join lateral (
           select p.user_id from student_parents sp join parents p on p.id = sp.parent_id
            where sp.student_id = s.id and p.user_id is not null
            order by sp.is_primary_contact desc limit 1
         ) pp on true
         left join users pu on pu.id = pp.user_id
         left join user_institution_memberships puim on puim.user_id = pu.id and puim.institution_id = $1
        where uim.institution_id = $1`,
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

    const sorted = sortRoster(rows.map((r) => ({ ...r, full_name: r.full_name })));
    return sorted.map((r) => ({
      userId: r.user_id,
      email: r.email,
      fullName: r.full_name,
      isClaimed: r.auth_user_id !== null,
      membershipStatus: r.status,
      roleCodes: rolesByUser.get(r.user_id)?.codes ?? [],
      roleNames: rolesByUser.get(r.user_id)?.names ?? [],
      currentPassword: r.phone,
      studentId: r.student_id,
      className: r.class_name,
      sectionName: r.section_name,
      rollNumber: r.roll_number,
      parent: r.parent_user_id
        ? {
            userId: r.parent_user_id,
            fullName: r.parent_full_name ?? "",
            isClaimed: r.parent_auth_user_id !== null,
            membershipStatus: r.parent_status ?? "active",
            currentPassword: r.parent_phone,
          }
        : null,
    }));
  });
}

/** Shared by createInstitutionUser() and setUserPassword()'s "not yet
 *  claimed" branch: create a real auth account with an explicit password,
 *  but recover instead of failing when one already exists under that email
 *  (see adminFindUserByEmail()'s own doc comment on the AuthService
 *  interface for exactly how/why that happens — a real, live example: an
 *  admin.gmail.com-style account gets "Could not create the login (A user
 *  with this email address has already been registered)" trying to set a
 *  password for a 'Not signed up yet' row, because someone used the OLD
 *  self-service /login sign-up form with this email once, before this
 *  admin-set-password feature existed, and never came back to confirm/sign
 *  in — a real, live orphaned account, not a data error). Found account's
 *  password is set to the admin's chosen one too (adminUpdatePassword()),
 *  not left as whatever it was before — the admin typed a specific
 *  password expecting it to be THE password, not a fallback. Exported
 *  (unlike this file's other private helpers) purely so
 *  tests/unit/auth-account-recovery.test.ts can exercise it directly
 *  against a stub AuthService — the real SupabaseAuthProvider it normally
 *  runs against isn't reachable from the PGlite/dev-auth-provider
 *  integration test harness (dev auth is deliberately passwordless and
 *  never reports "already registered"). */
export async function createOrRecoverAuthAccount(
  authService: AuthService,
  email: string,
  password: string
): Promise<{ authUserId: string; wasCreated: boolean }> {
  const created = await authService.adminCreateUser(email, password);
  if (!("error" in created)) return { authUserId: created.authUserId, wasCreated: true };

  if (/already.*(registered|exists)/i.test(created.error)) {
    const existing = await authService.adminFindUserByEmail(email);
    if (existing) {
      const result = await authService.adminUpdatePassword(existing.authUserId, password);
      if (result && "error" in result) {
        throw new Error(`Found the existing login for "${email}" but could not set its password (${result.error}).`);
      }
      // wasCreated: false — a pre-existing account was recovered, not
      // freshly created by this call; callers must NEVER adminDeleteUser()
      // it just because a later step of THEIR OWN operation fails (see
      // createInstitutionUser()'s catch block for why this flag exists).
      return { authUserId: existing.authUserId, wasCreated: false };
    }
  }
  throw new Error(`Could not create the login (${created.error}).`);
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
    const { authUserId: newAuthUserId, wasCreated } = await createOrRecoverAuthAccount(authService, data.email, data.password);

    const newUserId = crypto.randomUUID();
    try {
      try {
        await scoped.query(
          `insert into users (id, auth_user_id, email, phone, full_name, preferred_locale)
           values ($1, $2, $3, $4, $5, 'en')`,
          [newUserId, newAuthUserId, data.email, data.password, data.fullName]
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
      // Only ever delete an account THIS call actually created — a
      // recovered (pre-existing) account must never be torn down just
      // because a later, unrelated step of THIS call failed; that account
      // may still matter elsewhere. adminDeleteUser() is a real Supabase
      // Auth account delete, not reversible.
      if (wasCreated) await authService.adminDeleteUser(newAuthUserId).catch(() => {});
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
      // createOrRecoverAuthAccount() handles the exact case that broke the
      // two staff accounts this feature was built to fix: a "Not signed up
      // yet" row whose email ALREADY has a real (but orphaned/unconfirmed)
      // Supabase Auth account from an old self-service sign-up attempt —
      // recovers and re-passwords it instead of failing with "already been
      // registered".
      const { authUserId: newAuthUserId, wasCreated } = await createOrRecoverAuthAccount(authService, email, data.password);
      const { rows: setRows } = await scoped.query<{ set_login_credentials: boolean }>(
        "select set_login_credentials($1, $2, $3) as set_login_credentials",
        [targetUserId, newAuthUserId, data.password]
      );
      if (!setRows[0]?.set_login_credentials) {
        if (wasCreated) await authService.adminDeleteUser(newAuthUserId).catch(() => {});
        throw new Error("Could not link the login to this user's account.");
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
