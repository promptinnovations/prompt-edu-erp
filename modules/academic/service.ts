/**
 * PROMPT EDU ERP — Academic module service (classes, sections, subjects).
 * ARCHITECTURE.md §G "module is a self-contained domain package" / §D.3.
 *
 * Every function requires an explicit institutionId (no query is ever run
 * without one) and runs through db.withInstitutionContext, so both RLS
 * (§E Gate 2) and this institutionId (§E Gate 1) must agree, or the RLS
 * layer independently blocks the row regardless of any bug here.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export interface ClassRecord {
  id: string;
  name: string;
  sort_order: number;
  academic_stream: string | null;
  stage: string | null;
}
export interface SectionRecord {
  id: string;
  class_id: string;
  name: string;
  capacity: number | null;
}
export interface SubjectRecord {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  // Education Type follow-up (migration 0041) — which curriculum track
  // this subject belongs to. Only meaningful (and only ever set) for a
  // 'both'-mode institution; null for every academic-only/islamic-only
  // institution's subjects.
  track: "academic" | "islamic" | null;
}

const createClassSchema = z.object({
  name: z.string().min(1).max(100), // Unicode-safe — any script, no Latin assumption (§S.3)
  sortOrder: z.number().int().default(0),
  academicStream: z.string().max(100).nullable().optional(),
  // Admin-editable grouping (LP/UP/HS/HSS or any institution's own
  // vocabulary) — replaces the old numeric-name-guessing that lived only in
  // the Classes hub UI (§Page-2 follow-up). Free text, not an enum, since
  // stage vocabulary varies by institution/board.
  stage: z.string().max(50).nullable().optional(),
});

export async function listClasses(institutionId: string, authUserId: string): Promise<ClassRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ClassRecord>(
      "select id, name, sort_order, academic_stream, stage from classes order by sort_order, name"
    );
    return rows;
  });
}

export async function createClass(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createClassSchema>,
  scopedClient?: DbClient // §Q.1: passed by bulk import's confirmImport() so every
                           // row in a batch commits inside ONE transaction rather
                           // than each insert opening its own (see modules/bulk/service.ts)
): Promise<ClassRecord> {
  const data = createClassSchema.parse(input); // server-side validation, independent of client (§X.2)
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<ClassRecord>(
      `insert into classes (institution_id, name, sort_order, academic_stream, stage)
       values ($1, $2, $3, $4, $5) returning id, name, sort_order, academic_stream, stage`,
      [institutionId, data.name, data.sortOrder, data.academicStream ?? null, data.stage ?? null]
    );
    await recordAudit(scoped, {
      institutionId,
      userId,
      action: "create",
      module: "academic",
      entityType: "classes",
      entityId: rows[0].id,
      after: rows[0],
    });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

const updateClassSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  academicStream: z.string().max(100).nullable().optional(),
  stage: z.string().max(50).nullable().optional(),
});

export async function updateClass(
  institutionId: string, authUserId: string, userId: string, classId: string, input: z.infer<typeof updateClassSchema>
): Promise<ClassRecord | null> {
  const data = updateClassSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ClassRecord>(
      `update classes set
         name = coalesce($1, name),
         sort_order = coalesce($2, sort_order),
         academic_stream = case when $3 then $4 else academic_stream end,
         stage = case when $6 then $7 else stage end
       where id = $5
       returning id, name, sort_order, academic_stream, stage`,
      [
        data.name ?? null, data.sortOrder ?? null, "academicStream" in data, data.academicStream ?? null, classId,
        "stage" in data, data.stage ?? null,
      ]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "academic", entityType: "classes", entityId: classId, after: rows[0] });
    return rows[0];
  });
}

/** Hard-deletes a class (§137 follow-up "should be able ... delete"). Every
 *  FK that references classes.id (sections, class_subjects,
 *  teacher_assignments, student_enrollments, exam_classes) cascades — see
 *  0001_foundation.sql — EXCEPT attendance_records and portion_plans, which
 *  have no ON DELETE clause and so block the delete at the database level
 *  (Postgres default NO ACTION) once real attendance/portion data exists.
 *  The explicit enrolled-students guard below gives a clear, actionable
 *  error for the single most common blocker (an admin trying to delete a
 *  class students are still actively enrolled in) before ever reaching that
 *  harder-to-read foreign-key-violation case. */
export async function deleteClass(institutionId: string, authUserId: string, userId: string, classId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: enrolled } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from student_enrollments where class_id = $1 and status = 'active'",
      [classId]
    );
    if (Number(enrolled[0]?.count ?? 0) > 0) {
      throw new Error("This class still has actively enrolled students — move or remove them first.");
    }
    let deleted;
    try {
      deleted = await scoped.query<{ id: string; name: string }>("delete from classes where id = $1 returning id, name", [classId]);
    } catch {
      throw new Error("This class can't be deleted yet — it's still referenced by attendance or syllabus records.");
    }
    if (deleted.rows.length === 0) return;
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "academic", entityType: "classes", entityId: classId, before: deleted.rows[0] });
  });
}

const createSectionSchema = z.object({
  classId: z.string().uuid(),
  name: z.string().min(1).max(50),
  capacity: z.number().int().positive().nullable().optional(),
});

export async function listSections(institutionId: string, authUserId: string, classId?: string): Promise<SectionRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SectionRecord>(
      classId
        ? "select id, class_id, name, capacity from sections where class_id = $1 order by name"
        : "select id, class_id, name, capacity from sections order by name",
      classId ? [classId] : []
    );
    return rows;
  });
}

export async function createSection(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createSectionSchema>,
  scopedClient?: DbClient // §Q.1, see createClass() above
): Promise<SectionRecord> {
  const data = createSectionSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<SectionRecord>(
      `insert into sections (institution_id, class_id, name, capacity)
       values ($1, $2, $3, $4) returning id, class_id, name, capacity`,
      [institutionId, data.classId, data.name, data.capacity ?? null]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "academic",
      entityType: "sections", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

const updateSectionSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  capacity: z.number().int().positive().nullable().optional(),
});

export async function updateSection(
  institutionId: string, authUserId: string, userId: string, sectionId: string, input: z.infer<typeof updateSectionSchema>
): Promise<SectionRecord | null> {
  const data = updateSectionSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SectionRecord>(
      `update sections set
         name = coalesce($1, name),
         capacity = case when $2 then $3 else capacity end
       where id = $4
       returning id, class_id, name, capacity`,
      [data.name ?? null, "capacity" in data, data.capacity ?? null, sectionId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "academic", entityType: "sections", entityId: sectionId, after: rows[0] });
    return rows[0];
  });
}

/** Same enrolled-students guard as deleteClass() above, scoped to just this section. */
export async function deleteSection(institutionId: string, authUserId: string, userId: string, sectionId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: enrolled } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from student_enrollments where section_id = $1 and status = 'active'",
      [sectionId]
    );
    if (Number(enrolled[0]?.count ?? 0) > 0) {
      throw new Error("This division still has actively enrolled students — move or remove them first.");
    }
    let deleted;
    try {
      deleted = await scoped.query<{ id: string; name: string }>("delete from sections where id = $1 returning id, name", [sectionId]);
    } catch {
      throw new Error("This division can't be deleted yet — it's still referenced by attendance or syllabus records.");
    }
    if (deleted.rows.length === 0) return;
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "academic", entityType: "sections", entityId: sectionId, before: deleted.rows[0] });
  });
}

const createSubjectSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().max(30).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  // Only meaningful for a 'both'-mode institution — the create-subject UI
  // only offers this field at all when the institution's education_mode is
  // 'both' (§ education-track follow-up).
  track: z.enum(["academic", "islamic"]).nullable().optional(),
});

export async function listSubjects(institutionId: string, authUserId: string): Promise<SubjectRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SubjectRecord>(
      "select id, name, code, category, track from subjects order by name"
    );
    return rows;
  });
}

export async function createSubject(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createSubjectSchema>,
  scopedClient?: DbClient // §Q.1, see createClass() above
): Promise<SubjectRecord> {
  const data = createSubjectSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<SubjectRecord>(
      `insert into subjects (institution_id, name, code, category, track)
       values ($1, $2, $3, $4, $5) returning id, name, code, category, track`,
      [institutionId, data.name, data.code ?? null, data.category ?? null, data.track ?? null]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "academic",
      entityType: "subjects", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

const updateSubjectTrackSchema = z.object({ track: z.enum(["academic", "islamic"]).nullable() });

/** Retags an existing subject's track — the only edit surface subjects
 *  have today (§ education-track follow-up). Lets an admin who created
 *  subjects before switching this institution to 'both' mode (or before
 *  this feature existed at all) sort them into Academic/Islamic
 *  afterward, without needing a full subject-edit form. */
export async function updateSubjectTrack(
  institutionId: string, authUserId: string, userId: string,
  subjectId: string, input: z.infer<typeof updateSubjectTrackSchema>
): Promise<void> {
  const data = updateSubjectTrackSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ track: string | null }>("select track from subjects where id = $1", [subjectId]);
    await scoped.query("update subjects set track = $1 where id = $2", [data.track, subjectId]);
    await recordAudit(scoped, {
      institutionId, userId, action: "update", module: "academic", entityType: "subjects", entityId: subjectId,
      before: { track: before[0]?.track ?? null }, after: { track: data.track },
    });
  });
}

// -----------------------------------------------------------------------------
// Class ↔ subject links (class_subjects). Populated automatically by
// super-admin-service.ts's provisionSksvbDefaults() for SKSVB madrasas, but
// until now had no read function or UI for ANY institution — the table sat
// completely unused by the app layer (§137 follow-up "subjects should be
// visible in classes as well"). listClassSubjects() + the two mutators below
// are the general-purpose version every institution (SKSVB or not) can use.
// -----------------------------------------------------------------------------

export interface ClassSubjectRecord {
  id: string;
  class_id: string;
  subject_id: string;
  subject_name: string;
  is_core: boolean;
}

export async function listClassSubjects(institutionId: string, authUserId: string, classId?: string): Promise<ClassSubjectRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ClassSubjectRecord>(
      classId
        ? `select cs.id, cs.class_id, cs.subject_id, s.name as subject_name, cs.is_core
             from class_subjects cs join subjects s on s.id = cs.subject_id
            where cs.class_id = $1
            order by s.name`
        : `select cs.id, cs.class_id, cs.subject_id, s.name as subject_name, cs.is_core
             from class_subjects cs join subjects s on s.id = cs.subject_id
            order by s.name`,
      classId ? [classId] : []
    );
    return rows;
  });
}

const assignClassSubjectSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  isCore: z.boolean().default(true),
});

/** Idempotent by design (`on conflict ... do update`) — safe to call again
 *  to change is_core without a separate update function. */
export async function assignSubjectToClass(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof assignClassSubjectSchema>
): Promise<ClassSubjectRecord> {
  const data = assignClassSubjectSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; class_id: string; subject_id: string; is_core: boolean }>(
      `insert into class_subjects (institution_id, class_id, subject_id, is_core)
       values ($1, $2, $3, $4)
       on conflict (institution_id, class_id, subject_id) do update set is_core = excluded.is_core
       returning id, class_id, subject_id, is_core`,
      [institutionId, data.classId, data.subjectId, data.isCore]
    );
    const { rows: subjRows } = await scoped.query<{ name: string }>("select name from subjects where id = $1", [data.subjectId]);
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "academic",
      entityType: "class_subjects", entityId: rows[0].id, after: rows[0],
    });
    return { ...rows[0], subject_name: subjRows[0]?.name ?? "" };
  });
}

export async function removeSubjectFromClass(
  institutionId: string, authUserId: string, userId: string, classId: string, subjectId: string
): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: deleted } = await scoped.query<{ id: string }>(
      "delete from class_subjects where class_id = $1 and subject_id = $2 returning id",
      [classId, subjectId]
    );
    if (deleted.length === 0) return;
    await recordAudit(scoped, {
      institutionId, userId, action: "delete", module: "academic",
      entityType: "class_subjects", entityId: deleted[0].id,
    });
  });
}

// -----------------------------------------------------------------------------
// Academic years / terms (§D.3) — examinations, enrollments, and attendance
// all key off academic_year_id, so these are foundational to Phase 3+.
// -----------------------------------------------------------------------------

export interface AcademicYearRecord {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}
export interface TermRecord {
  id: string;
  academic_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
}

const createAcademicYearSchema = z.object({
  name: z.string().min(1).max(50), // e.g. "2026-2027"
  startDate: z.string(), // ISO date
  endDate: z.string(),
  isCurrent: z.boolean().default(false),
});

export async function listAcademicYears(institutionId: string, authUserId: string): Promise<AcademicYearRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AcademicYearRecord>(
      "select id, name, start_date, end_date, is_current from academic_years order by start_date desc"
    );
    return rows;
  });
}

export async function getCurrentAcademicYear(institutionId: string, authUserId: string): Promise<AcademicYearRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AcademicYearRecord>(
      "select id, name, start_date, end_date, is_current from academic_years where is_current = true limit 1"
    );
    return rows[0] ?? null;
  });
}

export async function createAcademicYear(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createAcademicYearSchema>
): Promise<AcademicYearRecord> {
  const data = createAcademicYearSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    if (data.isCurrent) {
      // Only one "current" academic year per institution — data-driven, not
      // a special code path per institution (§2).
      await scoped.query("update academic_years set is_current = false where is_current = true");
    }
    const { rows } = await scoped.query<AcademicYearRecord>(
      `insert into academic_years (institution_id, name, start_date, end_date, is_current)
       values ($1, $2, $3, $4, $5)
       returning id, name, start_date, end_date, is_current`,
      [institutionId, data.name, data.startDate, data.endDate, data.isCurrent]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "academic",
      entityType: "academic_years", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  });
}

export async function listTerms(institutionId: string, authUserId: string, academicYearId?: string): Promise<TermRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<TermRecord>(
      academicYearId
        ? "select id, academic_year_id, name, start_date, end_date from terms where academic_year_id = $1 order by start_date"
        : "select id, academic_year_id, name, start_date, end_date from terms order by start_date",
      academicYearId ? [academicYearId] : []
    );
    return rows;
  });
}

/** Flips a DIFFERENT, already-existing academic year to current — the only
 *  prior way to set is_current was passing isCurrent: true to
 *  createAcademicYear() at creation time. "Archive previous year" (§Page-2
 *  follow-up) needs no separate archived flag: a year simply stops being
 *  is_current once a newer one is marked current, and its enrollments/exams/
 *  attendance remain exactly where they are, permanently queryable. */
export async function setCurrentAcademicYear(
  institutionId: string, authUserId: string, userId: string, academicYearId: string
): Promise<AcademicYearRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query("update academic_years set is_current = false where is_current = true");
    const { rows } = await scoped.query<AcademicYearRecord>(
      "update academic_years set is_current = true where id = $1 returning id, name, start_date, end_date, is_current",
      [academicYearId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, {
      institutionId, userId, action: "edit", module: "academic",
      entityType: "academic_years", entityId: academicYearId, after: rows[0],
    });
    return rows[0];
  });
}

// -----------------------------------------------------------------------------
// Class promotion (§Page-2 follow-up "Promotion" — full bulk workflow): move
// a class's whole active roster into a new academic year in one confirmed
// action, with a per-student override before committing. Nothing here
// mutates the PRIOR year's enrollment row for promote/repeat — that row is
// each student's permanent historical record for that year — a NEW
// student_enrollments row is inserted for the target academic year instead,
// exactly the same shape createStudentEnrollment already produces elsewhere.
// Only the non-advancing outcomes (graduate/transfer_out/dropout) touch the
// CURRENT year's row, closing it out via the existing exit_date/exit_reason
// columns (0001_foundation.sql) rather than inventing a new mechanism.
// -----------------------------------------------------------------------------

export type PromotionAction = "promote" | "repeat" | "graduate" | "transfer_out" | "dropout";

export interface PromotionPreviewRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  roll_number: number | null;
  gender: string | null;
  suggested_action: PromotionAction;
  suggested_class_id: string | null;
  suggested_class_name: string | null;
}

/** Suggests, per student, promote-to-the-next-higher-sort_order class (or
 *  "graduate" if this is already the institution's highest class) — always
 *  editable per student before promoteClass() is ever called. */
export async function getPromotionPreview(
  institutionId: string, authUserId: string, fromClassId: string, fromSectionId?: string
): Promise<PromotionPreviewRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const currentYear = await scoped.query<{ id: string }>(
      "select id from academic_years where is_current = true limit 1"
    );
    if (currentYear.rows.length === 0) return [];

    const { rows: nextClassRows } = await scoped.query<{ id: string; name: string }>(
      `select id, name from classes
        where sort_order > (select sort_order from classes where id = $1)
        order by sort_order asc limit 1`,
      [fromClassId]
    );
    const nextClass = nextClassRows[0] ?? null;

    const { rows } = await scoped.query<PromotionPreviewRow>(
      `select s.id as student_id, s.full_name, s.admission_number, se.roll_number, s.gender,
              $4::text as suggested_action, $5::uuid as suggested_class_id, $6::text as suggested_class_name
         from student_enrollments se
         join students s on s.id = se.student_id
        where se.academic_year_id = $1 and se.class_id = $2
          and ($3::uuid is null or se.section_id = $3)
          and se.status = 'active'
        order by se.roll_number nulls last, s.full_name`,
      [
        currentYear.rows[0].id, fromClassId, fromSectionId ?? null,
        nextClass ? "promote" : "graduate", nextClass?.id ?? null, nextClass?.name ?? null,
      ]
    );
    return rows;
  });
}

export interface PromotionDecision {
  studentId: string;
  action: PromotionAction;
  toClassId?: string | null;
  toSectionId?: string | null;
}

export interface PromoteClassResult {
  promoted: number;
  repeated: number;
  graduated: number;
  transferredOut: number;
  droppedOut: number;
  skippedAlreadyEnrolled: string[]; // studentIds that already had an active enrollment in the target year
}

const promoteClassSchema = z.object({
  fromClassId: z.string().uuid(),
  fromSectionId: z.string().uuid().nullable().optional(),
  toAcademicYearId: z.string().uuid(),
  decisions: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        action: z.enum(["promote", "repeat", "graduate", "transfer_out", "dropout"]),
        toClassId: z.string().uuid().nullable().optional(),
        toSectionId: z.string().uuid().nullable().optional(),
      })
    )
    .min(1),
});

export async function promoteClass(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof promoteClassSchema>
): Promise<PromoteClassResult> {
  const data = promoteClassSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const currentYear = await scoped.query<{ id: string }>(
      "select id from academic_years where is_current = true limit 1"
    );
    if (currentYear.rows.length === 0) throw new Error("No current academic year is set.");
    const fromAcademicYearId = currentYear.rows[0].id;

    const result: PromoteClassResult = {
      promoted: 0, repeated: 0, graduated: 0, transferredOut: 0, droppedOut: 0, skippedAlreadyEnrolled: [],
    };

    for (const decision of data.decisions) {
      if (decision.action === "promote" || decision.action === "repeat") {
        if (!decision.toClassId || !decision.toSectionId) {
          throw new Error(`A target class and division are required to ${decision.action} this student.`);
        }
        const { rows: existing } = await scoped.query<{ id: string }>(
          "select id from student_enrollments where student_id = $1 and academic_year_id = $2 and status = 'active'",
          [decision.studentId, data.toAcademicYearId]
        );
        if (existing.length > 0) {
          result.skippedAlreadyEnrolled.push(decision.studentId);
          continue;
        }
        await scoped.query(
          `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id, status)
           values ($1, $2, $3, $4, $5, 'active')`,
          [institutionId, decision.studentId, data.toAcademicYearId, decision.toClassId, decision.toSectionId]
        );
        if (decision.action === "promote") result.promoted += 1;
        else result.repeated += 1;
      } else {
        const status = decision.action === "graduate" ? "graduated" : decision.action === "transfer_out" ? "transferred" : "removed";
        const exitReason = decision.action === "graduate" ? "graduated" : decision.action === "transfer_out" ? "transferred_out" : "dropout";
        await scoped.query(
          `update student_enrollments
              set status = $1, exit_date = current_date, exit_reason = $2
            where student_id = $3 and academic_year_id = $4 and class_id = $5 and status = 'active'`,
          [status, exitReason, decision.studentId, fromAcademicYearId, data.fromClassId]
        );
        if (decision.action === "graduate") result.graduated += 1;
        else if (decision.action === "transfer_out") result.transferredOut += 1;
        else result.droppedOut += 1;
      }
    }

    await recordAudit(scoped, {
      institutionId, userId, action: "edit", module: "academic",
      entityType: "class_promotion", entityId: data.fromClassId, after: result,
    });
    return result;
  });
}

