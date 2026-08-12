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
import { recordAudit } from "../../services/audit/audit-service";

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
