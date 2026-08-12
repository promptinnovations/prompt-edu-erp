/**
 * PROMPT EDU ERP — Students module service. ARCHITECTURE.md §D.4/§G.
 * full_name accepts any of the six target scripts — no Latin-character
 * assumption anywhere in validation (§S.3).
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { assertBelowLimit } from "../../services/limits/limit-service";

export interface StudentRecord {
  id: string;
  admission_number: string;
  full_name: string;
  full_name_native: string | null;
  date_of_birth: string | null;
  gender: string | null;
  status: string;
  user_id: string | null;
  contact_email: string | null;
}

const createStudentSchema = z.object({
  admissionNumber: z.string().min(1).max(50),
  fullName: z.string().min(1).max(200), // Unicode-safe (§S.3) — Arabic/Malayalam/etc. all valid
  fullNameNative: z.string().max(200).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(), // ISO date string
  gender: z.string().max(20).nullable().optional(),
});

export async function listStudents(institutionId: string, authUserId: string): Promise<StudentRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StudentRecord>(
      `select id, admission_number, full_name, full_name_native, date_of_birth, gender, status, user_id, contact_email
         from students order by full_name`
    );
    return rows;
  });
}

export async function getStudent(institutionId: string, authUserId: string, studentId: string): Promise<StudentRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StudentRecord>(
      `select id, admission_number, full_name, full_name_native, date_of_birth, gender, status, user_id, contact_email
         from students where id = $1`,
      [studentId]
    );
    return rows[0] ?? null; // RLS guarantees this is null (not another institution's row) even under ID guessing (§E.3)
  });
}

export async function createStudent(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createStudentSchema>,
  scopedClient?: DbClient // §Q.1, see modules/academic/service.ts's createClass() for why
): Promise<StudentRecord> {
  const data = createStudentSchema.parse(input);
  const run = async (scoped: DbClient) => {
    // §W.2 — refuses the specific insert that would exceed the plan's
    // max_students cap; existing students are never affected.
    await assertBelowLimit(scoped, institutionId, "students");
    const { rows } = await scoped.query<StudentRecord>(
      `insert into students (institution_id, admission_number, full_name, full_name_native, date_of_birth, gender, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, admission_number, full_name, full_name_native, date_of_birth, gender, status, user_id, contact_email`,
      [
        institutionId,
        data.admissionNumber,
        data.fullName,
        data.fullNameNative ?? null,
        data.dateOfBirth ?? null,
        data.gender ?? null,
        userId,
      ]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "students",
      entityType: "students", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

// -----------------------------------------------------------------------------
// Enrollment (§D.4) — links a student to a class/section for an academic
// year. Kept minimal in this phase: one active enrollment is created per
// call; promotion/transfer history (closing out a prior enrollment) is a
// later-phase concern per the roadmap (§AA.2 Phase 2/3).
// -----------------------------------------------------------------------------
const enrollStudentSchema = z.object({
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
});

export interface EnrollmentRecord {
  id: string; student_id: string; class_id: string; section_id: string; academic_year_id: string;
}

export async function enrollStudent(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof enrollStudentSchema>
): Promise<EnrollmentRecord> {
  const data = enrollStudentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<EnrollmentRecord>(
      `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
       values ($1, $2, $3, $4, $5)
       returning id, student_id, class_id, section_id, academic_year_id`,
      [institutionId, data.studentId, data.academicYearId, data.classId, data.sectionId]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "students",
      entityType: "student_enrollments", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  });
}

export async function getCurrentEnrollment(institutionId: string, authUserId: string, studentId: string): Promise<EnrollmentRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<EnrollmentRecord>(
      `select se.id, se.student_id, se.class_id, se.section_id, se.academic_year_id
         from student_enrollments se
         join academic_years ay on ay.id = se.academic_year_id
        where se.student_id = $1 and ay.is_current = true and se.status = 'active'
        order by se.enrollment_date desc limit 1`,
      [studentId]
    );
    return rows[0] ?? null;
  });
}

// -----------------------------------------------------------------------------
// Parents/guardians (§D.4) — `parents`/`student_parents` existed in the
// schema since migration 0001 but had no service/UI until Phase 12, same
// situation staff_attendance/teacher_assignments were in before Phase 10.
// -----------------------------------------------------------------------------
export interface ParentRecord {
  id: string; full_name: string; phone: string | null; email: string | null; occupation: string | null; user_id: string | null;
}
export interface ParentLinkRow extends ParentRecord {
  relationship: string | null; is_primary_contact: boolean;
}

const createParentSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  occupation: z.string().max(150).nullable().optional(),
});

export async function createParent(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createParentSchema>,
  scopedClient?: DbClient // §Q.1
): Promise<ParentRecord> {
  const data = createParentSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<ParentRecord>(
      `insert into parents (institution_id, full_name, phone, email, occupation)
       values ($1, $2, $3, $4, $5) returning id, full_name, phone, email, occupation, user_id`,
      [institutionId, data.fullName, data.phone ?? null, data.email ?? null, data.occupation ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "students", entityType: "parents", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

export async function listParents(institutionId: string, authUserId: string): Promise<ParentRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ParentRecord>(
      "select id, full_name, phone, email, occupation, user_id from parents order by full_name"
    );
    return rows;
  });
}

const linkParentSchema = z.object({
  studentId: z.string().uuid(),
  parentId: z.string().uuid(),
  relationship: z.string().max(50).nullable().optional(),
  isPrimaryContact: z.boolean().default(false),
});

export async function linkParentToStudent(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof linkParentSchema>,
  scopedClient?: DbClient // §Q.1
): Promise<{ id: string }> {
  const data = linkParentSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into student_parents (institution_id, student_id, parent_id, relationship, is_primary_contact)
       values ($1, $2, $3, $4, $5)
       on conflict (institution_id, student_id, parent_id) do update set relationship = excluded.relationship, is_primary_contact = excluded.is_primary_contact
       returning id`,
      [institutionId, data.studentId, data.parentId, data.relationship ?? null, data.isPrimaryContact]
    );
    await recordAudit(scoped, { institutionId, userId, action: "link", module: "students", entityType: "student_parents", entityId: rows[0].id, after: data });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

export async function listParentsForStudent(institutionId: string, authUserId: string, studentId: string): Promise<ParentLinkRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ParentLinkRow>(
      `select p.id, p.full_name, p.phone, p.email, p.occupation, p.user_id,
              sp.relationship, sp.is_primary_contact
         from student_parents sp join parents p on p.id = sp.parent_id
        where sp.student_id = $1
        order by sp.is_primary_contact desc, p.full_name`,
      [studentId]
    );
    return rows;
  });
}

