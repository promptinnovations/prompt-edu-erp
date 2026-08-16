/**
 * PROMPT EDU ERP — Portal identity & provisioning service.
 * ARCHITECTURE.md §D.4 (People), §Z ("(portals)/" route group), Phase 12
 * (§AA.2).
 *
 * The core rule this file exists to enforce: a student/parent portal page
 * must NEVER accept an arbitrary studentId/parentId from client input and
 * trust it. Every read here resolves "your own" id server-side from your
 * OWN authenticated identity (users.id), then only ever queries that
 * specific, server-resolved id — RLS's institution-isolation gate has no
 * notion of "which specific student/parent within this institution", so
 * this is an application-layer gate on top of it, same pattern Phase 11
 * used for mentoring's "assigned mentor only" rule (§75).
 *
 * Provisioning (creating the actual login account) reuses the exact
 * RLS-safe insert pattern learned the hard way in Phase 10's
 * createStaffMember(): a plain INSERT (never ON CONFLICT DO UPDATE against
 * `users`, since users_write_self only allows self-updates) with the new
 * row's id generated client-side (never RETURNING immediately after,
 * since INSERT...RETURNING re-checks SELECT policies on the just-inserted
 * row, which isn't visible yet until its membership row exists).
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { getAuthService } from "../../services/auth/auth-service";

export interface ChildRow {
  id: string; full_name: string; admission_number: string; relationship: string | null; is_primary_contact: boolean;
}

export async function getOwnStudentId(institutionId: string, authUserId: string, userId: string): Promise<string | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>("select id from students where user_id = $1", [userId]);
    return rows[0]?.id ?? null;
  });
}

export async function getOwnParentId(institutionId: string, authUserId: string, userId: string): Promise<string | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>("select id from parents where user_id = $1", [userId]);
    return rows[0]?.id ?? null;
  });
}

/** All children linked to a parent, given the parent's OWN id (resolved via
 *  getOwnParentId — never a caller-supplied parentId). */
export async function listChildrenForParent(institutionId: string, authUserId: string, parentId: string): Promise<ChildRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ChildRow>(
      `select s.id, s.full_name, s.admission_number, sp.relationship, sp.is_primary_contact
         from student_parents sp join students s on s.id = sp.student_id
        where sp.parent_id = $1
        order by sp.is_primary_contact desc, s.full_name`,
      [parentId]
    );
    return rows;
  });
}

/** Verifies a specific studentId genuinely belongs to this parent before
 *  the caller uses it for anything (e.g. loading that child's Student 360)
 *  — a parent portal page must call this rather than trusting a
 *  client-supplied "which child" selection. */
export async function isOwnChild(institutionId: string, authUserId: string, parentId: string, studentId: string): Promise<boolean> {
  const children = await listChildrenForParent(institutionId, authUserId, parentId);
  return children.some((c) => c.id === studentId);
}

const provisionStudentSchema = z.object({
  studentId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
});

/** Creates a users row + institution membership + 'student' role grant,
 *  then links students.user_id to it — the student portal equivalent of
 *  Phase 10's createStaffMember(). Throws if the student already has a
 *  linked account (students_user_id_unique) rather than silently
 *  re-linking, so this is never an accidental account swap. */
export async function provisionStudentPortalAccount(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof provisionStudentSchema>
): Promise<{ userId: string }> {
  const data = provisionStudentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: existing } = await scoped.query<{ user_id: string | null }>("select user_id from students where id = $1", [data.studentId]);
    if (existing.length === 0) throw new Error("Student not found.");
    if (existing[0].user_id) throw new Error("This student already has a portal account linked.");

    const newUserId = crypto.randomUUID();
    try {
      await scoped.query(
        `insert into users (id, email, full_name, preferred_locale) values ($1, $2, $3, 'en')`,
        [newUserId, data.email, data.fullName]
      );
    } catch {
      throw new Error(`A user with email "${data.email}" already exists — reusing an existing account isn't supported yet.`);
    }

    await scoped.query(
      `insert into user_institution_memberships (user_id, institution_id, status, is_primary)
       values ($1, $2, 'active', false) on conflict (user_id, institution_id) do nothing`,
      [newUserId, institutionId]
    );

    const { rows: roleRows } = await scoped.query<{ id: string }>(
      `select id from roles where institution_id = $1 and code = 'student'`, [institutionId]
    );
    if (roleRows.length > 0) {
      await scoped.query(
        `insert into user_roles (user_id, institution_id, role_id) values ($1, $2, $3) on conflict do nothing`,
        [newUserId, institutionId, roleRows[0].id]
      );
    }

    await scoped.query("update students set user_id = $1, updated_at = now() where id = $2", [newUserId, data.studentId]);
    await recordAudit(scoped, { institutionId, userId, action: "provision_portal_account", module: "students", entityType: "students", entityId: data.studentId, after: { newUserId } });
    return { userId: newUserId };
  });
}

const provisionParentSchema = z.object({
  parentId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
});

export async function provisionParentPortalAccount(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof provisionParentSchema>
): Promise<{ userId: string }> {
  const data = provisionParentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: existing } = await scoped.query<{ user_id: string | null }>("select user_id from parents where id = $1", [data.parentId]);
    if (existing.length === 0) throw new Error("Parent not found.");
    if (existing[0].user_id) throw new Error("This parent already has a portal account linked.");

    const newUserId = crypto.randomUUID();
    try {
      await scoped.query(
        `insert into users (id, email, full_name, preferred_locale) values ($1, $2, $3, 'en')`,
        [newUserId, data.email, data.fullName]
      );
    } catch {
      throw new Error(`A user with email "${data.email}" already exists — reusing an existing account isn't supported yet.`);
    }

    await scoped.query(
      `insert into user_institution_memberships (user_id, institution_id, status, is_primary)
       values ($1, $2, 'active', false) on conflict (user_id, institution_id) do nothing`,
      [newUserId, institutionId]
    );

    const { rows: roleRows } = await scoped.query<{ id: string }>(
      `select id from roles where institution_id = $1 and code = 'parent'`, [institutionId]
    );
    if (roleRows.length > 0) {
      await scoped.query(
        `insert into user_roles (user_id, institution_id, role_id) values ($1, $2, $3) on conflict do nothing`,
        [newUserId, institutionId, roleRows[0].id]
      );
    }

    await scoped.query("update parents set user_id = $1 where id = $2", [newUserId, data.parentId]);
    await recordAudit(scoped, { institutionId, userId, action: "provision_portal_account", module: "students", entityType: "parents", entityId: data.parentId, after: { newUserId } });
    return { userId: newUserId };
  });
}

// -----------------------------------------------------------------------------
// Name + parent-phone student login (§137 follow-up: "their log in id (must
// be student name, password- phone number of parent)"). Supabase Auth (and
// this app's own AuthService abstraction, services/auth/auth-service.ts)
// only ever authenticates by email — there is no username/alias sign-in
// path anywhere else in this codebase (see services/tenant/tenant-service.ts's
// linkOrResolveAuthenticatedUser(), which matches purely on
// `lower(email) = lower($1)`). Rather than bolt a second, parallel
// authentication mechanism onto the app, a student's "login id" is really
// just the display name for a SYNTHETIC, never-shown internal email
// (`<slugified login id>.<institution code>@students.prompt-edu-erp.internal`)
// — real, hashed-password Supabase Auth underneath, a plain name/phone
// login on the surface. The login screen resolves that mapping via
// resolveStudentLoginEmail() below, server-side, before ever calling
// AuthService.signIn() — see app/(auth)/login/actions.ts.
// -----------------------------------------------------------------------------

function slugifyForEmail(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip accents from scripts that have a Latin decomposition
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "student"
  );
}

/** Finds a login id that's free within this institution, starting from the
 *  student's own full name and falling back to "<name> 2", "<name> 3", …
 *  on collision (§137 follow-up, confirmed behavior) — checked inside the
 *  same transaction as the insert that will claim it, so two admins
 *  provisioning two same-named students back to back can't race each
 *  other onto the same login id.
 *
 *  Collision is checked by comparing the SLUGIFIED form (what actually
 *  becomes the synthetic email's local part), not the raw name — two
 *  names that differ only in punctuation/spacing (e.g. "Nasha Fathima .K"
 *  vs "Nasha Fathima. K") are otherwise "different" strings but collapse
 *  to the exact same slug, which the unique login_id INDEX (case- but not
 *  punctuation-insensitive) would still allow, but the email it produces
 *  would then collide and fail account creation. Fetches all of the
 *  institution's existing login_ids once (small — bounded by student
 *  count) rather than one query per attempt. */
async function generateUniqueLoginId(scoped: DbClient, institutionId: string, fullName: string): Promise<string> {
  const { rows } = await scoped.query<{ login_id: string }>(
    "select login_id from students where institution_id = $1 and login_id is not null",
    [institutionId]
  );
  const takenSlugs = new Set(rows.map((r) => slugifyForEmail(r.login_id)));
  const base = fullName.trim();
  let candidate = base;
  for (let suffix = 2; ; suffix++) {
    if (!takenSlugs.has(slugifyForEmail(candidate))) return candidate;
    candidate = `${base} ${suffix}`;
  }
}

const createStudentLoginSchema = z.object({
  studentId: z.string().uuid(),
  /** The parent's phone number, exactly as recorded on `parents.phone` —
   *  becomes the account password verbatim (§137 follow-up). */
  parentPhone: z.string().min(4).max(30),
});

export interface StudentLoginResult {
  userId: string;
  loginId: string;
}

/** Creates an immediately-usable student portal login with a server-set
 *  password (student name + parent phone), not a self-service "claim your
 *  account" flow — the deliberate exception to "nobody's password ever
 *  passes through this app's server" that services/auth/auth-service.ts's
 *  AuthService.adminCreateUser() doc comment describes, previously used
 *  only by services/super-admin/super-admin-service.ts's createInstitution().
 *  This is the second, equally narrow use: an admin explicitly supplying a
 *  parent's phone number AS the password, by this feature's own design,
 *  not the student choosing one. On any failure after adminCreateUser()
 *  succeeds, the just-created auth account is torn back down (same
 *  best-effort compensation createInstitution() uses) rather than left
 *  orphaned. Throws if the student already has a linked account. */
export async function createStudentLoginAccount(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createStudentLoginSchema>
): Promise<StudentLoginResult> {
  const data = createStudentLoginSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: studentRows } = await scoped.query<{ full_name: string; user_id: string | null }>(
      "select full_name, user_id from students where id = $1", [data.studentId]
    );
    if (studentRows.length === 0) throw new Error("Student not found.");
    if (studentRows[0].user_id) throw new Error("This student already has a portal login.");

    const { rows: instRows } = await scoped.query<{ code: string }>(
      "select code from institutions where id = $1", [institutionId]
    );
    const institutionCode = instRows[0]?.code ?? "institution";

    const loginId = await generateUniqueLoginId(scoped, institutionId, studentRows[0].full_name);
    const email = `${slugifyForEmail(loginId)}.${slugifyForEmail(institutionCode)}@students.prompt-edu-erp.internal`;

    const authService = await getAuthService();
    const authResult = await authService.adminCreateUser(email, data.parentPhone);
    if ("error" in authResult) {
      throw new Error(`Could not create the student login (${authResult.error}).`);
    }
    try {
      const newUserId = crypto.randomUUID(); // §Q.1: client-generated id — see this file's header comment on why RETURNING right after INSERT can't be used here
      await scoped.query(
        `insert into users (id, auth_user_id, email, phone, full_name, preferred_locale)
         values ($1, $2, $3, $4, $5, 'en')`,
        [newUserId, authResult.authUserId, email, data.parentPhone, studentRows[0].full_name]
      );
      await scoped.query(
        `insert into user_institution_memberships (user_id, institution_id, status, is_primary)
         values ($1, $2, 'active', false) on conflict (user_id, institution_id) do nothing`,
        [newUserId, institutionId]
      );
      const { rows: roleRows } = await scoped.query<{ id: string }>(
        `select id from roles where institution_id = $1 and code = 'student'`, [institutionId]
      );
      if (roleRows.length > 0) {
        await scoped.query(
          `insert into user_roles (user_id, institution_id, role_id) values ($1, $2, $3) on conflict do nothing`,
          [newUserId, institutionId, roleRows[0].id]
        );
      }
      await scoped.query(
        "update students set user_id = $1, login_id = $2, updated_at = now(), updated_by = $3 where id = $4",
        [newUserId, loginId, userId, data.studentId]
      );
      await recordAudit(scoped, {
        institutionId, userId, action: "provision_portal_account", module: "students",
        entityType: "students", entityId: data.studentId, after: { loginId },
      });
      return { userId: newUserId, loginId };
    } catch (err) {
      await authService.adminDeleteUser(authResult.authUserId).catch(() => {});
      throw err;
    }
  });
}

/** Resets an existing student login's password to (a possibly-updated)
 *  parent phone number — e.g. after correcting a mistyped number, or a
 *  family switching contact numbers. Requires the login to already exist
 *  (use createStudentLoginAccount() for the first-time case). */
export async function resetStudentLoginPassword(
  institutionId: string, authUserId: string, userId: string, studentId: string, parentPhone: string
): Promise<void> {
  const password = z.string().min(4).max(30).parse(parentPhone);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ user_id: string | null }>("select user_id from students where id = $1", [studentId]);
    if (!rows[0]?.user_id) throw new Error("This student doesn't have a portal login yet.");
    const { rows: userRows } = await scoped.query<{ auth_user_id: string | null }>("select auth_user_id from users where id = $1", [rows[0].user_id]);
    const authUserIdForLogin = userRows[0]?.auth_user_id;
    if (!authUserIdForLogin) throw new Error("This student's login has no linked authentication account to reset.");
    const authService = await getAuthService();
    const result = await authService.adminUpdatePassword(authUserIdForLogin, password);
    if (result && "error" in result) throw new Error(`Could not reset the login password (${result.error}).`);
    await scoped.query("update users set phone = $1, updated_at = now() where id = $2", [password, rows[0].user_id]);
    await recordAudit(scoped, { institutionId, userId, action: "reset_password", module: "students", entityType: "students", entityId: studentId });
  });
}

/** Pre-authentication lookup, same deliberately-narrow-and-safe pattern as
 *  services/institution/institution-service.ts's
 *  getInstitutionPublicSummaryByCode() — resolves a student's "Student
 *  login" tab input (their name, scoped to the institution the login page
 *  is already on via the active-institution cookie) to the internal
 *  synthetic email AuthService.signIn() actually needs. Returns null for
 *  any non-match (wrong name, wrong institution, or a student who has no
 *  portal login yet) — the caller then shows one generic "no student found"
 *  message rather than distinguishing those cases, so this can never be
 *  used to enumerate which names exist. */
export async function resolveStudentLoginEmail(institutionCode: string, loginId: string): Promise<{ email: string } | null> {
  const trimmed = loginId.trim();
  if (!trimmed) return null;
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: null, isSuperAdmin: true }, async (scoped) => {
    const { rows } = await scoped.query<{ email: string | null }>(
      `select u.email
         from students s
         join institutions i on i.id = s.institution_id
         join users u on u.id = s.user_id
        where lower(i.code) = lower($1) and lower(s.login_id) = lower($2) and s.user_id is not null`,
      [institutionCode, trimmed]
    );
    if (!rows[0]?.email) return null;
    return { email: rows[0].email };
  });
}

/** §Z routing helper: which portal (if any) a set of role codes belongs in.
 *  A user with ANY role outside {student, parent} always resolves to
 *  "institution" (the general admin app is a superset) — only a role set
 *  that is EXCLUSIVELY student and/or parent routes to a portal, and
 *  parent takes priority when both are present (the account holder for a
 *  family is conventionally the parent). Pure roleless users (shouldn't
 *  normally happen) also resolve to "institution" rather than a portal
 *  with nothing to show. */
export function resolvePortalDestination(roleCodes: Set<string>): "institution" | "student" | "parent" {
  if (roleCodes.size === 0) return "institution";
  const nonPortalRoles = [...roleCodes].filter((c) => c !== "student" && c !== "parent");
  if (nonPortalRoles.length > 0) return "institution";
  if (roleCodes.has("parent")) return "parent";
  return "student";
}
