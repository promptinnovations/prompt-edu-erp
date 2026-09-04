/**
 * PROMPT EDU ERP — Super Admin "Sample Portals" service.
 *
 * Follow-up ask (verbatim): "For super admin - in the side panel, add
 * different sample portals, to see the updated version with full data,
 * chosen from any institution, not fake data. principal, management,
 * class teacher, parent- student portals."
 *
 * Every candidate returned here is a REAL row from a REAL institution the
 * Super Admin picks — never synthetic/demo data. Eligibility is
 * deliberately gated to `users.auth_user_id is not null` (a genuinely
 * working login, the same signal Users & Roles' "Login status" column
 * already uses) — a role assignment with no confirmed auth account behind
 * it has nothing real to "view as" yet.
 *
 * "Principal" and "Management" are modeled as two DIFFERENT real role
 * codes on purpose, matching the actual role catalogue
 * (database/scripts/seed.ts's systemRoles): `institution_admin` (the
 * account created for the institution at onboarding, §139 — full
 * functional access) for Principal, and `management` (seeded there as
 * "Principal / Management", a narrower school-leadership permission set)
 * for Management — so the two sections show genuinely distinct accounts
 * and permission sets, not the same role relabeled twice.
 *
 * "Class Teacher" is not a role code at all — it's a `teacher_assignments`
 * row with role_type = 'class_teacher' (see services/scope/
 * teacher-scope-service.ts's own header comment) for the CURRENT academic
 * year, so only teachers who genuinely are a class teacher right now show
 * up, each labeled with the actual class/division they lead.
 *
 * "Parent & Student" reuses the same student+parent pairing shape
 * services/users/user-management-service.ts's listStudentUsersWithParent()
 * introduced for the Users & Roles split (§users-roles follow-up), already
 * in canonical section->GRADE->division->roll-number order, so the two
 * pages stay visually consistent.
 */
import { getDbClient } from "../db/client";
import { resolveUserByAuthId } from "../tenant/tenant-service";
import { sortRoster } from "../academic/roster-order";

export interface SamplePortalCandidate {
  userId: string;
  authUserId: string;
  fullName: string;
  email: string | null;
  /** Institution-specific context line — class/division led (class
   *  teacher), or null for Principal/Management (their access isn't
   *  scoped to one class). */
  detail: string | null;
}

export interface SamplePortalStudentCandidate {
  userId: string;
  authUserId: string;
  fullName: string;
  className: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  parent: { userId: string; authUserId: string; fullName: string } | null;
}

async function withSuperAdminContext<T>(actorAuthUserId: string, fn: (scoped: import("../db/client").DbClient) => Promise<T>): Promise<T> {
  const resolved = await resolveUserByAuthId(actorAuthUserId);
  if (!resolved || !resolved.isSuperAdmin) {
    throw new Error("Forbidden: this action requires the platform Super Admin role.");
  }
  const db = await getDbClient();
  // institutionId is passed through per-query below (not fixed here, since
  // every function in this file is itself parameterized by institutionId)
  // — isSuperAdmin: true grants the DB-context bypass every other
  // Super-Admin-only cross-tenant read in this codebase already uses (see
  // services/super-admin/super-admin-service.ts's own withSuperAdminContext).
  return db.withInstitutionContext({ institutionId: null, authUserId: actorAuthUserId, isSuperAdmin: true }, () => fn(db));
}

async function listByRoleCode(
  actorAuthUserId: string, institutionId: string, roleCode: string
): Promise<SamplePortalCandidate[]> {
  return withSuperAdminContext(actorAuthUserId, async (db) => {
    return db.withInstitutionContext({ institutionId, authUserId: actorAuthUserId, isSuperAdmin: true }, async (scoped) => {
      const { rows } = await scoped.query<{ user_id: string; auth_user_id: string; full_name: string; email: string | null }>(
        `select distinct u.id as user_id, u.auth_user_id, u.full_name, u.email
           from user_roles ur
           join roles r on r.id = ur.role_id
           join users u on u.id = ur.user_id
           join user_institution_memberships uim on uim.user_id = u.id and uim.institution_id = $1
          where ur.institution_id = $1 and r.code = $2 and u.auth_user_id is not null and uim.status = 'active'
          order by u.full_name`,
        [institutionId, roleCode]
      );
      return rows.map((r) => ({ userId: r.user_id, authUserId: r.auth_user_id, fullName: r.full_name, email: r.email, detail: null }));
    });
  });
}

/** Real accounts holding the `institution_admin` role (§139 — the account
 *  created at onboarding, full functional access) — the closest real-data
 *  equivalent of "Principal". */
export async function listSamplePrincipals(actorAuthUserId: string, institutionId: string): Promise<SamplePortalCandidate[]> {
  return listByRoleCode(actorAuthUserId, institutionId, "institution_admin");
}

/** Real accounts holding the `management` role ("Principal / Management"
 *  in the role catalogue's own name, database/scripts/seed.ts) — a
 *  narrower, school-leadership permission set distinct from
 *  institution_admin's full access. */
export async function listSampleManagement(actorAuthUserId: string, institutionId: string): Promise<SamplePortalCandidate[]> {
  return listByRoleCode(actorAuthUserId, institutionId, "management");
}

/** Real teachers who are the CURRENT academic year's class teacher of at
 *  least one class/division (teacher_assignments.role_type =
 *  'class_teacher') — each labeled with every class they lead, so picking
 *  one shows exactly what that real class teacher's dashboard/scoping
 *  looks like (services/scope/teacher-scope-service.ts). */
export async function listSampleClassTeachers(actorAuthUserId: string, institutionId: string): Promise<SamplePortalCandidate[]> {
  return withSuperAdminContext(actorAuthUserId, async (db) => {
    return db.withInstitutionContext({ institutionId, authUserId: actorAuthUserId, isSuperAdmin: true }, async (scoped) => {
      const { rows } = await scoped.query<{
        user_id: string; auth_user_id: string; full_name: string; email: string | null;
        class_name: string | null; section_name: string | null;
      }>(
        `select u.id as user_id, u.auth_user_id, u.full_name, u.email, c.name as class_name, sec.name as section_name
           from teacher_assignments ta
           join users u on u.id = ta.user_id
           join user_institution_memberships uim on uim.user_id = u.id and uim.institution_id = $1
           left join classes c on c.id = ta.class_id
           left join sections sec on sec.id = ta.section_id
          where ta.institution_id = $1 and ta.role_type = 'class_teacher'
            and ta.academic_year_id = (select id from academic_years where institution_id = $1 and is_current = true limit 1)
            and u.auth_user_id is not null and uim.status = 'active'
          order by u.full_name, c.name, sec.name`,
        [institutionId]
      );
      const byUser = new Map<string, SamplePortalCandidate>();
      for (const r of rows) {
        const label = [r.class_name, r.section_name].filter(Boolean).join(" ");
        const existing = byUser.get(r.user_id);
        if (existing) {
          existing.detail = existing.detail ? `${existing.detail}, ${label || "—"}` : label || "—";
        } else {
          byUser.set(r.user_id, {
            userId: r.user_id, authUserId: r.auth_user_id, fullName: r.full_name, email: r.email,
            detail: label ? `Class teacher — ${label}` : "Class teacher",
          });
        }
      }
      return Array.from(byUser.values());
    });
  });
}

/** Real students with a working login, each paired with their primary
 *  contact parent's own login (when that parent has one) — same query
 *  shape/order as listStudentUsersWithParent() (§users-roles follow-up),
 *  restricted to auth_user_id is not null on both sides so "View as
 *  Student"/"View as Parent" only ever offers an account that can
 *  genuinely sign in. */
export async function listSampleStudentsWithParent(actorAuthUserId: string, institutionId: string): Promise<SamplePortalStudentCandidate[]> {
  return withSuperAdminContext(actorAuthUserId, async (db) => {
    return db.withInstitutionContext({ institutionId, authUserId: actorAuthUserId, isSuperAdmin: true }, async (scoped) => {
      const { rows } = await scoped.query<{
        user_id: string; auth_user_id: string; full_name: string;
        stage: string | null; class_name: string | null; section_name: string | null; roll_number: number | null; gender: string | null;
        parent_user_id: string | null; parent_auth_user_id: string | null; parent_full_name: string | null;
      }>(
        `select u.id as user_id, u.auth_user_id, u.full_name, s.gender,
                c.stage, c.name as class_name, sec.name as section_name, se.roll_number,
                pu.id as parent_user_id, pu.auth_user_id as parent_auth_user_id, pu.full_name as parent_full_name
           from students s
           join users u on u.id = s.user_id
           join user_institution_memberships uim on uim.user_id = u.id and uim.institution_id = $1
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
           left join users pu on pu.id = pp.user_id and pu.auth_user_id is not null
          where s.institution_id = $1 and u.auth_user_id is not null and uim.status = 'active'`,
        [institutionId]
      );
      const sorted = sortRoster(rows.map((r) => ({ ...r, full_name: r.full_name })));
      return sorted.map((r) => ({
        userId: r.user_id,
        authUserId: r.auth_user_id,
        fullName: r.full_name,
        className: r.class_name,
        sectionName: r.section_name,
        rollNumber: r.roll_number,
        parent: r.parent_user_id && r.parent_auth_user_id
          ? { userId: r.parent_user_id, authUserId: r.parent_auth_user_id, fullName: r.parent_full_name ?? "" }
          : null,
      }));
    });
  });
}

/** Server-side re-verification for services/request-context.ts's "view as
 *  user" cookie — NEVER trusts the cookie's own userId/authUserId/label
 *  blindly (§X "never trust the client"): re-derives fresh from the DB,
 *  on every request, that this userId genuinely has an active membership
 *  in institutionId and a real auth_user_id, before request-context.ts is
 *  allowed to act as them. Returns null (silently falls back to the plain
 *  "full catalogue" super-admin view, same as a stale institution-view
 *  cookie already does) if the person/membership no longer exists. */
export async function getSamplePortalTarget(
  actorAuthUserId: string, institutionId: string, userId: string
): Promise<{ userId: string; authUserId: string; fullName: string; email: string | null } | null> {
  return withSuperAdminContext(actorAuthUserId, async (db) => {
    return db.withInstitutionContext({ institutionId, authUserId: actorAuthUserId, isSuperAdmin: true }, async (scoped) => {
      const { rows } = await scoped.query<{ auth_user_id: string | null; full_name: string; email: string | null }>(
        `select u.auth_user_id, u.full_name, u.email
           from users u
           join user_institution_memberships uim on uim.user_id = u.id and uim.institution_id = $1
          where u.id = $2 and uim.status = 'active'`,
        [institutionId, userId]
      );
      const row = rows[0];
      if (!row || !row.auth_user_id) return null;
      return { userId, authUserId: row.auth_user_id, fullName: row.full_name, email: row.email };
    });
  });
}
