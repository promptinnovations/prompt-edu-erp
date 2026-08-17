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
  login_id?: string | null;
}

/** §137 follow-up row shape for the searchable admin list — same student
 *  columns plus its CURRENT class/section (from student_enrollments, joined
 *  to whichever academic_year has is_current = true), so the admin students
 *  page can show and filter by class without a separate round trip per
 *  row. */
export interface StudentListRow extends StudentRecord {
  class_id: string | null;
  class_name: string | null;
  section_name: string | null;
  roll_number: number | null;
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
      `select id, admission_number, full_name, full_name_native, date_of_birth, gender, status, user_id, contact_email, login_id
         from students order by full_name`
    );
    return rows;
  });
}

export interface ListStudentsForAdminOptions {
  /** Matches against full_name, admission_number, or login_id (case-insensitive substring). */
  search?: string;
  /** Filter to one class's current-year enrollment. */
  classId?: string;
  /** Soft-deleted (§137 follow-up "delete") students are excluded by
   *  default — set true to include them (e.g. a "show removed" toggle). */
  includeWithdrawn?: boolean;
}

/** Search/filter-capable listing for the admin Students page (§137 follow-up
 *  "should be able ... search"). Deliberately a SEPARATE function from
 *  listStudents() above rather than adding optional params to it — over a
 *  dozen other call sites (attendance, scoring, library, reporting, bulk
 *  import, …) call listStudents() with its plain two-arg signature and
 *  expect every student back regardless of status; changing its default
 *  behavior to exclude withdrawn students would silently change all of
 *  those too. */
export async function listStudentsForAdmin(
  institutionId: string, authUserId: string, options: ListStudentsForAdminOptions = {}
): Promise<StudentListRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StudentListRow>(
      `select s.id, s.admission_number, s.full_name, s.full_name_native, s.date_of_birth, s.gender,
              s.status, s.user_id, s.contact_email, s.login_id,
              c.id as class_id, c.name as class_name, sec.name as section_name, se.roll_number
         from students s
         left join student_enrollments se
           on se.student_id = s.id and se.status = 'active'
          and se.academic_year_id = (select id from academic_years where institution_id = s.institution_id and is_current = true limit 1)
         left join classes c on c.id = se.class_id
         left join sections sec on sec.id = se.section_id
        where ($1::boolean or s.status <> 'withdrawn')
          and ($2::uuid is null or se.class_id = $2::uuid)
          and (
            $3::text is null
            or s.full_name ilike '%' || $3 || '%'
            or s.admission_number ilike '%' || $3 || '%'
            or coalesce(s.login_id, '') ilike '%' || $3 || '%'
          )
        order by c.sort_order nulls last, sec.name, s.full_name`,
      [options.includeWithdrawn ?? false, options.classId ?? null, options.search?.trim() || null]
    );
    return rows;
  });
}

const updateStudentSchema = z.object({
  admissionNumber: z.string().min(1).max(50).optional(),
  fullName: z.string().min(1).max(200).optional(),
  fullNameNative: z.string().max(200).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  gender: z.string().max(20).nullable().optional(),
});

export async function updateStudent(
  institutionId: string, authUserId: string, userId: string, studentId: string, input: z.infer<typeof updateStudentSchema>
): Promise<StudentRecord | null> {
  const data = updateStudentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StudentRecord>(
      `update students set
         admission_number = coalesce($1, admission_number),
         full_name = coalesce($2, full_name),
         full_name_native = case when $3 then $4 else full_name_native end,
         date_of_birth = case when $5 then $6::date else date_of_birth end,
         gender = case when $7 then $8 else gender end,
         updated_at = now(), updated_by = $9
       where id = $10
       returning id, admission_number, full_name, full_name_native, date_of_birth, gender, status, user_id, contact_email, login_id`,
      [
        data.admissionNumber ?? null, data.fullName ?? null,
        "fullNameNative" in data, data.fullNameNative ?? null,
        "dateOfBirth" in data, data.dateOfBirth ?? null,
        "gender" in data, data.gender ?? null,
        userId, studentId,
      ]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "students", entityType: "students", entityId: studentId, after: rows[0] });
    return rows[0];
  });
}

/** Soft-delete (§137 follow-up "should be able ... delete") — sets status
 *  to 'withdrawn' rather than a hard DELETE. A hard delete would either
 *  cascade destructively through every module that references student_id
 *  (attendance, exams, scoring, portfolio, library loans, …) or be flatly
 *  rejected by whichever of those has no ON DELETE clause — the exact
 *  tradeoff documented on deleteClass()/deleteSection() above, but far
 *  worse here given how many modules key off a student. The seeded
 *  `student.delete` permission's own description ("Soft-delete a student
 *  record") already anticipated this. Reversible via restoreStudent(). */
export async function deleteStudent(institutionId: string, authUserId: string, userId: string, studentId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; status: string }>(
      "update students set status = 'withdrawn', updated_at = now(), updated_by = $1 where id = $2 and status <> 'withdrawn' returning id, status",
      [userId, studentId]
    );
    if (rows.length === 0) return;
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "students", entityType: "students", entityId: studentId, after: rows[0] });
  });
}

export async function restoreStudent(institutionId: string, authUserId: string, userId: string, studentId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      "update students set status = 'active', updated_at = now(), updated_by = $1 where id = $2 and status = 'withdrawn' returning id",
      [userId, studentId]
    );
    if (rows.length === 0) return;
    await recordAudit(scoped, { institutionId, userId, action: "restore", module: "students", entityType: "students", entityId: studentId });
  });
}

export async function getStudent(institutionId: string, authUserId: string, studentId: string): Promise<StudentRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StudentRecord>(
      `select id, admission_number, full_name, full_name_native, date_of_birth, gender, status, user_id, contact_email, login_id
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
  id: string; student_id: string; class_id: string; section_id: string; academic_year_id: string; roll_number?: number | null;
}

/** A past or present enrollment row for one student, with class/section
 *  names resolved for display (§137 follow-up "removed data should be
 *  stored ... if required for restoring") — used by the student detail
 *  page's "class history" section to show removed/transferred rows
 *  alongside the one active row (if any), each with its own restore
 *  action where applicable. */
export interface EnrollmentHistoryRow {
  id: string; status: string; class_id: string; class_name: string; section_id: string; section_name: string;
  academic_year_id: string; academic_year_name: string; enrollment_date: string; exit_date: string | null;
  exit_reason: string | null; roll_number: number | null;
}

export async function enrollStudent(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof enrollStudentSchema>,
  scopedClient?: DbClient // §Q.1, see modules/academic/service.ts's createClass() for why — needed
                           // so the "Enrollments" bulk import entity type (modules/bulk/service.ts)
                           // can commit every row of a batch inside one transaction.
): Promise<EnrollmentRecord> {
  const data = enrollStudentSchema.parse(input);
  const run = async (scoped: DbClient) => {
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
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

/** All currently-active enrollments in the institution, keyed loosely by
 *  (student, academic year) — used by the "Enrollments" bulk import entity
 *  type (modules/bulk/service.ts) to detect "this student is already
 *  enrolled for that year" up front, same O(1)-queries-not-O(N) prepareContext
 *  pattern every other bulk entity type uses (§Q.1). */
export async function listActiveEnrollments(institutionId: string, authUserId: string): Promise<{ student_id: string; academic_year_id: string }[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ student_id: string; academic_year_id: string }>(
      "select student_id, academic_year_id from student_enrollments where status = 'active'"
    );
    return rows;
  });
}

export async function getCurrentEnrollment(institutionId: string, authUserId: string, studentId: string): Promise<EnrollmentRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<EnrollmentRecord>(
      `select se.id, se.student_id, se.class_id, se.section_id, se.academic_year_id, se.roll_number
         from student_enrollments se
         join academic_years ay on ay.id = se.academic_year_id
        where se.student_id = $1 and ay.is_current = true and se.status = 'active'
        order by se.enrollment_date desc limit 1`,
      [studentId]
    );
    return rows[0] ?? null;
  });
}

/** Every enrollment row (active, removed, or transferred) this student has
 *  ever had, newest first — the "class history" the student detail page
 *  shows below the current enrollment, so a removed/transferred row is
 *  never actually gone (§137 follow-up), just not the one counted as
 *  active anywhere. */
export async function listEnrollmentHistory(institutionId: string, authUserId: string, studentId: string): Promise<EnrollmentHistoryRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<EnrollmentHistoryRow>(
      `select se.id, se.status, se.class_id, c.name as class_name, se.section_id, sec.name as section_name,
              se.academic_year_id, ay.name as academic_year_name, se.enrollment_date, se.exit_date, se.exit_reason, se.roll_number
         from student_enrollments se
         join classes c on c.id = se.class_id
         join sections sec on sec.id = se.section_id
         join academic_years ay on ay.id = se.academic_year_id
        where se.student_id = $1
        order by se.enrollment_date desc, se.id desc`,
      [studentId]
    );
    return rows;
  });
}

const moveEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  newClassId: z.string().uuid(),
  newSectionId: z.string().uuid(),
});

/** Moves a student from their current active class/section to a different
 *  one (§137 follow-up "moving from one class to another") — closes out
 *  the prior active enrollment (status='transferred', exit_date=today)
 *  rather than mutating its class_id/section_id in place, and inserts a
 *  fresh active row for the new class/section, so the old placement stays
 *  visible in listEnrollmentHistory() instead of being overwritten. Both
 *  writes happen in one transaction — see modules/academic/service.ts's
 *  createClass() doc comment for why withInstitutionContext() itself is
 *  what supplies that transaction. */
export async function transferStudentEnrollment(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof moveEnrollmentSchema>
): Promise<EnrollmentRecord> {
  const data = moveEnrollmentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: current } = await scoped.query<{ id: string; academic_year_id: string }>(
      `select se.id, se.academic_year_id from student_enrollments se
         join academic_years ay on ay.id = se.academic_year_id
        where se.student_id = $1 and ay.is_current = true and se.status = 'active'
        order by se.enrollment_date desc limit 1`,
      [data.studentId]
    );
    if (current.length === 0) throw new Error("This student has no active class enrollment to move.");

    await scoped.query(
      `update student_enrollments set status = 'transferred', exit_date = current_date, exit_reason = 'Moved to another class'
        where id = $1`,
      [current[0].id]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "transfer", module: "students",
      entityType: "student_enrollments", entityId: current[0].id, before: { status: "active" }, after: { status: "transferred" },
    });

    const { rows } = await scoped.query<EnrollmentRecord>(
      `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
       values ($1, $2, $3, $4, $5)
       returning id, student_id, class_id, section_id, academic_year_id`,
      [institutionId, data.studentId, current[0].academic_year_id, data.newClassId, data.newSectionId]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "students",
      entityType: "student_enrollments", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  });
}

/** Unenrolls a student from their current active class WITHOUT withdrawing
 *  the student from the institution (§137 follow-up "removing" — distinct
 *  from deleteStudent()'s institution-wide withdrawal above). Sets the
 *  enrollment's status to 'removed' and stamps exit_date/exit_reason; the
 *  row is kept (not deleted) so restoreEnrollment() can bring it back, but
 *  every active-enrollment query (getCurrentEnrollment,
 *  listStudentsForAdmin's class join, listActiveEnrollments) already
 *  filters on status = 'active' and so stops showing it immediately. */
export async function removeStudentFromClass(
  institutionId: string, authUserId: string, userId: string, studentId: string, reason?: string | null
): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `update student_enrollments se set status = 'removed', exit_date = current_date, exit_reason = $1
         from academic_years ay
        where se.academic_year_id = ay.id and ay.is_current = true and se.status = 'active' and se.student_id = $2
        returning se.id`,
      [reason?.trim() || "Removed from class", studentId]
    );
    if (rows.length === 0) throw new Error("This student has no active class enrollment to remove.");
    await recordAudit(scoped, { institutionId, userId, action: "remove", module: "students", entityType: "student_enrollments", entityId: rows[0].id });
  });
}

/** Reactivates a previously removed or transferred enrollment row exactly
 *  as it was (§137 follow-up "should be stored, if required for
 *  restoring") — refuses if the student already has a different active
 *  enrollment for that same academic year, since a student can only be in
 *  one class at a time; remove or move that one first. */
export async function restoreEnrollment(institutionId: string, authUserId: string, userId: string, enrollmentId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: target } = await scoped.query<{ student_id: string; academic_year_id: string; status: string }>(
      "select student_id, academic_year_id, status from student_enrollments where id = $1", [enrollmentId]
    );
    if (target.length === 0) throw new Error("Enrollment record not found.");
    if (target[0].status === "active") return;
    const { rows: clash } = await scoped.query<{ id: string }>(
      "select id from student_enrollments where student_id = $1 and academic_year_id = $2 and status = 'active'",
      [target[0].student_id, target[0].academic_year_id]
    );
    if (clash.length > 0) throw new Error("This student already has an active class enrollment for that academic year — remove or move it first.");
    await scoped.query(
      "update student_enrollments set status = 'active', exit_date = null, exit_reason = null where id = $1",
      [enrollmentId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "restore", module: "students", entityType: "student_enrollments", entityId: enrollmentId });
  });
}

/** One row of the roster assignRollNumbers() below sorts and numbers. */
interface RollNumberCandidate { id: string; gender: string | null }

/** Recomputes roll numbers for every actively-enrolled student in one
 *  class+section+academic-year (§137 follow-up "roll number should be male
 *  first in alphabetic order then girls in alphabetic order") — males
 *  (any of 'm'/'male', case-insensitive) sorted alphabetically by name get
 *  1..N first, then females get the following numbers, also alphabetical;
 *  any other/unset gender value sorts after females, alphabetical among
 *  themselves, rather than erroring, so a row with a blank gender doesn't
 *  block the rest of the class from being numbered. Always a full
 *  recompute of the whole roster (not an incremental patch) so the
 *  sequence stays dense (1..N, no gaps) after adds/removes/moves — call it
 *  again any time the roster changes. */
export async function assignRollNumbers(
  institutionId: string, authUserId: string, userId: string, classId: string, sectionId: string, academicYearId: string
): Promise<number> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<RollNumberCandidate & { full_name: string }>(
      `select se.id, s.gender, s.full_name
         from student_enrollments se join students s on s.id = se.student_id
        where se.class_id = $1 and se.section_id = $2 and se.academic_year_id = $3 and se.status = 'active'
        order by
          case when lower(coalesce(s.gender, '')) in ('m', 'male') then 0
               when lower(coalesce(s.gender, '')) in ('f', 'female') then 1
               else 2 end,
          s.full_name`,
      [classId, sectionId, academicYearId]
    );
    for (let i = 0; i < rows.length; i++) {
      await scoped.query("update student_enrollments set roll_number = $1 where id = $2", [i + 1, rows[i].id]);
    }
    if (rows.length > 0) {
      await recordAudit(scoped, {
        institutionId, userId, action: "recompute", module: "students",
        entityType: "student_enrollments", entityId: classId, after: { classId, sectionId, academicYearId, count: rows.length },
      });
    }
    return rows.length;
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

const updateParentSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  occupation: z.string().max(150).nullable().optional(),
});

export async function updateParent(
  institutionId: string, authUserId: string, userId: string, parentId: string, input: z.infer<typeof updateParentSchema>
): Promise<ParentRecord | null> {
  const data = updateParentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ParentRecord>(
      `update parents set
         full_name = coalesce($1, full_name),
         phone = case when $2 then $3 else phone end,
         email = case when $4 then $5 else email end,
         occupation = case when $6 then $7 else occupation end
       where id = $8
       returning id, full_name, phone, email, occupation, user_id`,
      [
        data.fullName ?? null,
        "phone" in data, data.phone ?? null,
        "email" in data, data.email ?? null,
        "occupation" in data, data.occupation ?? null,
        parentId,
      ]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "students", entityType: "parents", entityId: parentId, after: rows[0] });
    return rows[0];
  });
}

/** Removes ONE parent/guardian's link to ONE student (§137 follow-up
 *  "should be able ... delete") — the `parents` row itself, and any link it
 *  has to a SIBLING, is untouched, since one parent can be linked to
 *  several children via student_parents (see this module's header
 *  comment). This is what the "Remove" button next to a parent row on a
 *  student's page does. Use deleteParentRecord() below for the rarer case
 *  of removing the person from the institution entirely. */
export async function unlinkParentFromStudent(
  institutionId: string, authUserId: string, userId: string, studentId: string, parentId: string
): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      "delete from student_parents where student_id = $1 and parent_id = $2 returning id",
      [studentId, parentId]
    );
    if (rows.length === 0) return;
    await recordAudit(scoped, { institutionId, userId, action: "unlink", module: "students", entityType: "student_parents", entityId: rows[0].id, before: { studentId, parentId } });
  });
}

/** Hard-deletes a parent/guardian record entirely — cascades through every
 *  student_parents link they have (§D.4/0001_foundation.sql), so this
 *  removes them from ALL of their children's pages, not just one. Their
 *  portal login (if provisioned) is orphaned rather than deleted along
 *  with them (parents.user_id references users(id) on delete set null) —
 *  the `users` table has no delete RLS policy in this schema (see
 *  0001_foundation.sql), so the login account itself, if ever provisioned,
 *  is left dormant rather than removed. */
export async function deleteParentRecord(institutionId: string, authUserId: string, userId: string, parentId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; full_name: string }>(
      "delete from parents where id = $1 returning id, full_name",
      [parentId]
    );
    if (rows.length === 0) return;
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "students", entityType: "parents", entityId: parentId, before: rows[0] });
  });
}

