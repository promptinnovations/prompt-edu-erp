/**
 * PROMPT EDU ERP — Examination module service.
 * ARCHITECTURE.md §D.5, §27-31 of the master spec.
 *
 * exam_types and grade_scales/grade_bands are institution CONFIGURATION
 * (§K "never hard-code institutional scoring/thresholds") — nothing in this
 * file assumes particular exam names or grading cut-offs; those are always
 * looked up from the database for the calling institution.
 *
 * Mark workflow: draft -> submitted -> verified -> approved -> locked
 * (§28). Only approved/locked marks ever feed results/analytics (§28 "Once
 * marks are approved, they feed the analytics engine"). Editing a mark that
 * is already approved/locked goes through correctMark(), which preserves an
 * audit trail in mark_change_history rather than silently overwriting
 * (§28 "correction history").
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export interface ExamTypeRecord { id: string; code: string; name: string }
export interface ExaminationRecord {
  id: string; name: string; status: string; exam_type_id: string;
  academic_year_id: string; term_id: string | null; start_date: string | null; end_date: string | null;
  grade_scale_id: string | null;
}
export interface ExamSubjectRecord { id: string; examination_id: string; subject_id: string; max_marks: string; pass_marks: string }
export interface MarkRow {
  student_id: string; student_name: string; admission_number: string;
  mark_id: string | null; marks_obtained: string | null; is_absent: boolean; entry_status: string | null;
}
export interface GradeBandRecord { id: string; min_percent: string; max_percent: string; grade_label: string; grade_point: string | null }
export interface ResultRow {
  student_id: string; student_name: string; total_marks: string; max_total_marks: string;
  percentage: string; grade_label: string | null; rank: number | null;
}

// ---------------------------------------------------------------------------
// Exam types (config)
// ---------------------------------------------------------------------------
const examTypeSchema = z.object({ code: z.string().min(1).max(50), name: z.string().min(1).max(150) });

export async function listExamTypes(institutionId: string, authUserId: string): Promise<ExamTypeRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExamTypeRecord>("select id, code, name from exam_types order by name");
    return rows;
  });
}

export async function createExamType(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof examTypeSchema>
): Promise<ExamTypeRecord> {
  const data = examTypeSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExamTypeRecord>(
      `insert into exam_types (institution_id, code, name) values ($1, $2, $3) returning id, code, name`,
      [institutionId, data.code, data.name]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "exam_types", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// Grade scales / bands (config) — §30 "never hard-code thresholds"
// ---------------------------------------------------------------------------
export async function getDefaultGradeScaleId(institutionId: string, authUserId: string): Promise<string | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      "select id from grade_scales where is_default = true limit 1"
    );
    return rows[0]?.id ?? null;
  });
}

export async function getGradeBands(institutionId: string, authUserId: string, gradeScaleId: string): Promise<GradeBandRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<GradeBandRecord>(
      "select id, min_percent, max_percent, grade_label, grade_point from grade_bands where grade_scale_id = $1 order by min_percent desc",
      [gradeScaleId]
    );
    return rows;
  });
}

/** §137 follow-up ("sometimes configurations also will be different") —
 *  grade_scales/grade_bands existed in the schema and were readable since
 *  Phase 2, but only ever populated by seed scripts; there was no way for
 *  an institution admin to define their own grading scheme (e.g. a
 *  madrasa's Kithab pass/fail bands vs. a school's A+–F letter grades) —
 *  only listExamTypes()/createExamType() had that for exam types. This
 *  block is the same treatment for grade scales/bands, wired into a new
 *  Settings sub-page rather than in-line on /examinations, since a grading
 *  scheme is institution-wide configuration, not a per-examination choice
 *  (an examination merely PICKS one via its own gradeScaleId, unchanged). */
export interface GradeScaleRecord { id: string; name: string; is_default: boolean }

export async function listGradeScales(institutionId: string, authUserId: string): Promise<GradeScaleRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<GradeScaleRecord>("select id, name, is_default from grade_scales order by name");
    return rows;
  });
}

const createGradeScaleSchema = z.object({ name: z.string().min(1).max(150), isDefault: z.boolean().optional() });

export async function createGradeScale(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createGradeScaleSchema>
): Promise<GradeScaleRecord> {
  const data = createGradeScaleSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    if (data.isDefault) {
      await scoped.query("update grade_scales set is_default = false where is_default = true");
    }
    const { rows } = await scoped.query<GradeScaleRecord>(
      `insert into grade_scales (institution_id, name, is_default) values ($1, $2, $3) returning id, name, is_default`,
      [institutionId, data.name, data.isDefault ?? false]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "grade_scales", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const updateGradeScaleSchema = z.object({ name: z.string().min(1).max(150).optional() });

export async function updateGradeScale(
  institutionId: string, authUserId: string, userId: string, gradeScaleId: string, input: z.infer<typeof updateGradeScaleSchema>
): Promise<GradeScaleRecord> {
  const data = updateGradeScaleSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<GradeScaleRecord>(
      `update grade_scales set name = coalesce($2, name) where id = $1 returning id, name, is_default`,
      [gradeScaleId, data.name ?? null]
    );
    if (!rows[0]) throw new Error("Grade scale not found.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "examination", entityType: "grade_scales", entityId: gradeScaleId, after: rows[0] });
    return rows[0];
  });
}

export async function setDefaultGradeScale(institutionId: string, authUserId: string, userId: string, gradeScaleId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query("update grade_scales set is_default = false where is_default = true");
    const { rows } = await scoped.query("update grade_scales set is_default = true where id = $1 returning id", [gradeScaleId]);
    if (rows.length === 0) throw new Error("Grade scale not found.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "examination", entityType: "grade_scales", entityId: gradeScaleId, after: { is_default: true } });
  });
}

/** Refuses to delete a grade scale any examination still points at (its
 *  results already reference grade_bands under this scale) — same
 *  "guard, don't hard-DELETE-and-hope" pattern updateClass()/deleteClass()
 *  established in modules/academic/service.ts. Grade bands cascade off the
 *  scale at the DB level (migration 0005's `on delete cascade`), so this
 *  check is what stands in for that on a scale that's actually in use. */
export async function deleteGradeScale(institutionId: string, authUserId: string, userId: string, gradeScaleId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: used } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from examinations where grade_scale_id = $1", [gradeScaleId]
    );
    if (Number(used[0]?.count ?? 0) > 0) {
      throw new Error("This grade scale is used by one or more examinations and can't be deleted.");
    }
    const { rows } = await scoped.query("delete from grade_scales where id = $1 returning id", [gradeScaleId]);
    if (rows.length === 0) throw new Error("Grade scale not found.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "grade_scales", entityId: gradeScaleId });
  });
}

const createGradeBandSchema = z.object({
  gradeScaleId: z.string().uuid(),
  minPercent: z.number().min(0).max(100),
  maxPercent: z.number().min(0).max(100),
  gradeLabel: z.string().min(1).max(20),
  gradePoint: z.number().nullable().optional(),
});

export async function createGradeBand(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createGradeBandSchema>
): Promise<GradeBandRecord> {
  const data = createGradeBandSchema.parse(input);
  if (data.minPercent > data.maxPercent) throw new Error("Minimum percent cannot exceed maximum percent.");
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<GradeBandRecord>(
      `insert into grade_bands (institution_id, grade_scale_id, min_percent, max_percent, grade_label, grade_point)
       values ($1, $2, $3, $4, $5, $6) returning id, min_percent, max_percent, grade_label, grade_point`,
      [institutionId, data.gradeScaleId, data.minPercent, data.maxPercent, data.gradeLabel, data.gradePoint ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "grade_bands", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const updateGradeBandSchema = z.object({
  minPercent: z.number().min(0).max(100).optional(),
  maxPercent: z.number().min(0).max(100).optional(),
  gradeLabel: z.string().min(1).max(20).optional(),
  gradePoint: z.number().nullable().optional(),
});

export async function updateGradeBand(
  institutionId: string, authUserId: string, userId: string, gradeBandId: string, input: z.infer<typeof updateGradeBandSchema>
): Promise<GradeBandRecord> {
  const data = updateGradeBandSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<GradeBandRecord>(
      `update grade_bands set
         min_percent = coalesce($2, min_percent),
         max_percent = coalesce($3, max_percent),
         grade_label = coalesce($4, grade_label),
         grade_point = case when $5 then $6 else grade_point end
       where id = $1 returning id, min_percent, max_percent, grade_label, grade_point`,
      [gradeBandId, data.minPercent ?? null, data.maxPercent ?? null, data.gradeLabel ?? null,
        Object.prototype.hasOwnProperty.call(data, "gradePoint"), data.gradePoint ?? null]
    );
    if (!rows[0]) throw new Error("Grade band not found.");
    if (Number(rows[0].min_percent) > Number(rows[0].max_percent)) throw new Error("Minimum percent cannot exceed maximum percent.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "examination", entityType: "grade_bands", entityId: gradeBandId, after: rows[0] });
    return rows[0];
  });
}

export async function deleteGradeBand(institutionId: string, authUserId: string, userId: string, gradeBandId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query("delete from grade_bands where id = $1 returning id", [gradeBandId]);
    if (rows.length === 0) throw new Error("Grade band not found.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "grade_bands", entityId: gradeBandId });
  });
}

// ---------------------------------------------------------------------------
// Examinations
// ---------------------------------------------------------------------------
const createExaminationSchema = z.object({
  examTypeId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  termId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  gradeScaleId: z.string().uuid().nullable().optional(),
});

export async function listExaminations(institutionId: string, authUserId: string): Promise<ExaminationRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExaminationRecord>(
      `select id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id
         from examinations order by created_at desc`
    );
    return rows;
  });
}

export async function getExamination(institutionId: string, authUserId: string, examinationId: string): Promise<ExaminationRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExaminationRecord>(
      `select id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id
         from examinations where id = $1`,
      [examinationId]
    );
    return rows[0] ?? null;
  });
}

export async function createExamination(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createExaminationSchema>
): Promise<ExaminationRecord> {
  const data = createExaminationSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    let gradeScaleId = data.gradeScaleId ?? null;
    if (!gradeScaleId) {
      const { rows: def } = await scoped.query<{ id: string }>("select id from grade_scales where is_default = true limit 1");
      gradeScaleId = def[0]?.id ?? null;
    }
    const { rows } = await scoped.query<ExaminationRecord>(
      `insert into examinations (institution_id, exam_type_id, academic_year_id, term_id, name, grade_scale_id)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id`,
      [institutionId, data.examTypeId, data.academicYearId, data.termId ?? null, data.name, gradeScaleId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "examinations", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const addExamSubjectSchema = z.object({
  examinationId: z.string().uuid(),
  subjectId: z.string().uuid(),
  maxMarks: z.number().positive().default(100),
  passMarks: z.number().nonnegative().default(35),
});

export async function addExamSubject(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof addExamSubjectSchema>
): Promise<ExamSubjectRecord> {
  const data = addExamSubjectSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExamSubjectRecord>(
      `insert into exam_subjects (institution_id, examination_id, subject_id, max_marks, pass_marks)
       values ($1, $2, $3, $4, $5)
       returning id, examination_id, subject_id, max_marks, pass_marks`,
      [institutionId, data.examinationId, data.subjectId, data.maxMarks, data.passMarks]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "exam_subjects", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function listExamSubjects(institutionId: string, authUserId: string, examinationId: string): Promise<ExamSubjectRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExamSubjectRecord>(
      "select id, examination_id, subject_id, max_marks, pass_marks from exam_subjects where examination_id = $1",
      [examinationId]
    );
    return rows;
  });
}

export async function addExamClass(
  institutionId: string, authUserId: string, examinationId: string, classId: string, sectionId?: string | null
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      `insert into exam_classes (institution_id, examination_id, class_id, section_id)
       values ($1, $2, $3, $4) on conflict do nothing`,
      [institutionId, examinationId, classId, sectionId ?? null]
    );
  });
}

/** "Teachers can give access only to their respective classes" follow-up —
 *  the set of class ids one examination applies to (from exam_classes),
 *  used by the marks entry page to check whether a scoped teacher (one
 *  without marks.approve) is actually assigned to teach the exam_subject's
 *  subject in at least one of them before granting access to that grid. */
export async function getExamCoveredClassIds(institutionId: string, authUserId: string, examinationId: string): Promise<string[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ class_id: string }>(
      "select distinct class_id from exam_classes where examination_id = $1",
      [examinationId]
    );
    return rows.map((r) => r.class_id);
  });
}

/** Reverse of getExamCoveredClassIds() — "Exams added" on the class page
 *  (§Page-2 follow-up): every examination that covers this class, so the
 *  class page can list them and link out to each exam's own existing
 *  result/consolidated/report-card pages (deliberately not a new combined
 *  cross-exam view — each exam keeps its own page). Uses
 *  idx_exam_classes_institution_class (migration 0032). */
export async function listExaminationsForClass(
  institutionId: string, authUserId: string, classId: string
): Promise<ExaminationRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExaminationRecord>(
      `select e.id, e.name, e.status, e.exam_type_id, e.academic_year_id, e.term_id, e.start_date, e.end_date, e.grade_scale_id
         from examinations e
        where exists (select 1 from exam_classes ec where ec.examination_id = e.id and ec.class_id = $1)
        order by e.start_date desc nulls last, e.created_at desc`,
      [classId]
    );
    return rows;
  });
}

/** "Examination > Mark entry status" follow-up — for one examination, how
 *  far along mark entry is per subject: how many students are expected to
 *  have a mark (enrolled in a class/section that exam covers) vs how many
 *  actually have one yet. Lets an admin see at a glance which subjects
 *  still need marks entered instead of opening each subject's grid one by
 *  one. `entry_status` on `marks` isn't used here — a row existing in
 *  `marks` at all (regardless of its own status) counts as "entered",
 *  since even a draft/unverified entry means someone has started. */
export interface MarkEntryStatusRow {
  exam_subject_id: string; subject_name: string; max_marks: string; pass_marks: string;
  expected: number; entered: number;
}

export async function getMarkEntryStatus(institutionId: string, authUserId: string, examinationId: string): Promise<MarkEntryStatusRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<MarkEntryStatusRow>(
      `select es.id as exam_subject_id, sub.name as subject_name, es.max_marks, es.pass_marks,
              count(distinct se.student_id) as expected,
              count(distinct m.student_id) as entered
         from exam_subjects es
         join subjects sub on sub.id = es.subject_id
         join exam_classes ec on ec.examination_id = es.examination_id
         join student_enrollments se on se.class_id = ec.class_id
              and (ec.section_id is null or se.section_id = ec.section_id) and se.status = 'active'
         left join marks m on m.exam_subject_id = es.id and m.student_id = se.student_id
        where es.examination_id = $1
        group by es.id, sub.name, es.max_marks, es.pass_marks
        order by sub.name`,
      [examinationId]
    );
    return rows.map((r) => ({ ...r, expected: Number(r.expected), entered: Number(r.entered) }));
  });
}

// ---------------------------------------------------------------------------
// Mark entry grid (§28)
// ---------------------------------------------------------------------------
export async function getMarksGrid(institutionId: string, authUserId: string, examSubjectId: string): Promise<MarkRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    // Students enrolled in any of the classes/sections this examination applies to,
    // left-joined with any existing mark for this exam_subject (draft grid).
    const { rows } = await scoped.query<MarkRow>(
      `select s.id as student_id, s.full_name as student_name, s.admission_number,
              m.id as mark_id, m.marks_obtained, coalesce(m.is_absent, false) as is_absent, m.entry_status
         from exam_subjects es
         join exam_classes ec on ec.examination_id = es.examination_id
         join student_enrollments se on se.class_id = ec.class_id
              and (ec.section_id is null or se.section_id = ec.section_id)
         join students s on s.id = se.student_id
         left join marks m on m.exam_subject_id = es.id and m.student_id = s.id
        where es.id = $1
        group by s.id, s.full_name, s.admission_number, m.id, m.marks_obtained, m.is_absent, m.entry_status
        order by s.full_name`,
      [examSubjectId]
    );
    return rows;
  });
}

const markEntrySchema = z.array(
  z.object({
    studentId: z.string().uuid(),
    marksObtained: z.number().nullable(),
    isAbsent: z.boolean().default(false),
  })
);

/** Bulk mark entry — only touches marks still in 'draft' (or not yet created). Editing
 *  an already-submitted/verified/approved/locked mark must go through correctMark(). */
export async function enterMarks(
  institutionId: string, authUserId: string, userId: string, examSubjectId: string, entries: z.infer<typeof markEntrySchema>
): Promise<{ updated: number; skippedLocked: number }> {
  const data = markEntrySchema.parse(entries);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    let updated = 0;
    let skippedLocked = 0;
    for (const e of data) {
      const { rows: existing } = await scoped.query<{ id: string; entry_status: string }>(
        "select id, entry_status from marks where exam_subject_id = $1 and student_id = $2",
        [examSubjectId, e.studentId]
      );
      if (existing.length > 0 && existing[0].entry_status !== "draft") {
        skippedLocked++;
        continue;
      }
      await scoped.query(
        `insert into marks (institution_id, exam_subject_id, student_id, marks_obtained, is_absent, entry_status, entered_by)
         values ($1, $2, $3, $4, $5, 'draft', $6)
         on conflict (institution_id, exam_subject_id, student_id)
         do update set marks_obtained = excluded.marks_obtained, is_absent = excluded.is_absent,
                        entered_by = excluded.entered_by, updated_at = now()
         where marks.entry_status = 'draft'`,
        [institutionId, examSubjectId, e.studentId, e.isAbsent ? null : e.marksObtained, e.isAbsent, userId]
      );
      updated++;
    }
    return { updated, skippedLocked };
  });
}

async function transitionMarks(
  institutionId: string, authUserId: string, examSubjectId: string,
  from: string, to: string, actorColumn: "verified_by" | "approved_by" | null, userId: string
): Promise<number> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const setActor = actorColumn ? `, ${actorColumn} = $4` : "";
    const params = actorColumn ? [to, examSubjectId, from, userId] : [to, examSubjectId, from];
    const { rows } = await scoped.query(
      `update marks set entry_status = $1${setActor}, updated_at = now()
         where exam_subject_id = $2 and entry_status = $3
         returning id`,
      params
    );
    return rows.length;
  });
}

export const submitMarks = (institutionId: string, authUserId: string, examSubjectId: string, userId: string) =>
  transitionMarks(institutionId, authUserId, examSubjectId, "draft", "submitted", null, userId);

export const verifyMarks = (institutionId: string, authUserId: string, examSubjectId: string, userId: string) =>
  transitionMarks(institutionId, authUserId, examSubjectId, "submitted", "verified", "verified_by", userId);

export const approveMarks = (institutionId: string, authUserId: string, examSubjectId: string, userId: string) =>
  transitionMarks(institutionId, authUserId, examSubjectId, "verified", "approved", "approved_by", userId);

export const lockMarks = (institutionId: string, authUserId: string, examSubjectId: string, userId: string) =>
  transitionMarks(institutionId, authUserId, examSubjectId, "approved", "locked", null, userId);

/** Corrects an already approved/locked mark, preserving history (§28 "correction history").
 *  Caller (server action) must check the marks.lock permission before invoking this — it
 *  deliberately bypasses the normal draft-only edit path in enterMarks(). */
export async function correctMark(
  institutionId: string, authUserId: string, userId: string, markId: string, newValue: number | null, reason: string
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ marks_obtained: string | null }>(
      "select marks_obtained from marks where id = $1", [markId]
    );
    if (rows.length === 0) throw new Error("Mark not found");
    const oldValue = rows[0].marks_obtained === null ? null : Number(rows[0].marks_obtained);

    await scoped.query("update marks set marks_obtained = $1, updated_at = now() where id = $2", [newValue, markId]);
    await scoped.query(
      `insert into mark_change_history (institution_id, mark_id, old_value, new_value, changed_by, reason)
       values ($1, $2, $3, $4, $5, $6)`,
      [institutionId, markId, oldValue, newValue, userId, reason]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "correct", module: "examination", entityType: "marks", entityId: markId,
      before: { marks_obtained: oldValue }, after: { marks_obtained: newValue, reason },
    });
  });
}

// ---------------------------------------------------------------------------
// Results (§28 "once marks are approved, they feed the analytics engine")
// ---------------------------------------------------------------------------
export async function computeResults(institutionId: string, authUserId: string, examinationId: string): Promise<{ computed: number; skippedIncomplete: number }> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: examSubjects } = await scoped.query<{ id: string; max_marks: string }>(
      "select id, max_marks from exam_subjects where examination_id = $1", [examinationId]
    );
    if (examSubjects.length === 0) return { computed: 0, skippedIncomplete: 0 };
    const maxTotal = examSubjects.reduce((sum, s) => sum + Number(s.max_marks), 0);
    const examSubjectIds = examSubjects.map((s) => s.id);

    const { rows: examRow } = await scoped.query<{ grade_scale_id: string | null }>(
      "select grade_scale_id from examinations where id = $1", [examinationId]
    );
    const gradeScaleId = examRow[0]?.grade_scale_id ?? null;

    // Only students with an approved/locked mark for EVERY exam_subject count —
    // a partial result would misrepresent the student (§28).
    const { rows: studentTotals } = await scoped.query<{ student_id: string; total: string; count: string }>(
      `select student_id, sum(marks_obtained) as total, count(*) as count
         from marks
        where exam_subject_id = any($1) and entry_status in ('approved','locked') and is_absent = false
        group by student_id`,
      [examSubjectIds]
    );

    let computed = 0;
    let skippedIncomplete = 0;
    for (const st of studentTotals) {
      if (Number(st.count) !== examSubjects.length) {
        skippedIncomplete++;
        continue;
      }
      const total = Number(st.total);
      const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

      let gradeBandId: string | null = null;
      if (gradeScaleId) {
        const { rows: band } = await scoped.query<{ id: string }>(
          `select id from grade_bands where grade_scale_id = $1 and $2 >= min_percent and $2 <= max_percent limit 1`,
          [gradeScaleId, percentage]
        );
        gradeBandId = band[0]?.id ?? null;
      }

      await scoped.query(
        `insert into results (institution_id, examination_id, student_id, total_marks, max_total_marks, percentage, grade_band_id, computed_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())
         on conflict (institution_id, examination_id, student_id)
         do update set total_marks = excluded.total_marks, max_total_marks = excluded.max_total_marks,
                        percentage = excluded.percentage, grade_band_id = excluded.grade_band_id, computed_at = now()`,
        [institutionId, examinationId, st.student_id, total, maxTotal, percentage, gradeBandId]
      );
      computed++;
    }
    return { computed, skippedIncomplete };
  });
}

/** "Result > Consolidated marks / Report Cards" follow-up — one flat row
 *  per (student, exam_subject) covering EVERY subject of the examination,
 *  base on the students actually enrolled in the classes/sections this
 *  examination covers (exam_classes) rather than only students who already
 *  have a mark, so a not-yet-entered subject still shows as a blank cell
 *  instead of silently disappearing. Both the Consolidated Marks grid
 *  (pivots this into a student x subject matrix) and the per-student
 *  Report Card page (filters to one student_id) are built on this same
 *  query — one source of truth for "every mark this exam has", matching
 *  §P.1's "one query, many renderings" philosophy. */
export interface ExaminationMarksMatrixRow {
  student_id: string; student_name: string; admission_number: string;
  exam_subject_id: string; subject_name: string; max_marks: string; pass_marks: string;
  marks_obtained: string | null; is_absent: boolean;
}

/** `classId` (§Page-6 follow-up "Consolidated Marks — select exam, class
 *  from dropdown") narrows to one of the exam's covered classes; omitted or
 *  empty means "every class this exam covers", the original behaviour. */
export async function getExaminationMarksMatrix(
  institutionId: string, authUserId: string, examinationId: string, classId?: string | null
): Promise<ExaminationMarksMatrixRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExaminationMarksMatrixRow>(
      `select distinct se.student_id, s.full_name as student_name, s.admission_number,
              es.id as exam_subject_id, sub.name as subject_name, es.max_marks, es.pass_marks,
              m.marks_obtained, coalesce(m.is_absent, false) as is_absent
         from exam_subjects es
         join subjects sub on sub.id = es.subject_id
         join exam_classes ec on ec.examination_id = es.examination_id
         join student_enrollments se on se.class_id = ec.class_id
              and (ec.section_id is null or se.section_id = ec.section_id) and se.status = 'active'
         join students s on s.id = se.student_id
         left join marks m on m.exam_subject_id = es.id and m.student_id = se.student_id
        where es.examination_id = $1 and ($2::uuid is null or se.class_id = $2)
        order by s.full_name, sub.name`,
      [examinationId, classId || null]
    );
    return rows;
  });
}

/** The distinct classes an examination actually covers (§Page-6 follow-up)
 *  — powers the Consolidated Marks page's class dropdown, so it only ever
 *  offers classes this exam is relevant to, not every class in the school. */
export interface ExaminationClassOption { id: string; name: string }
export async function listClassesForExamination(
  institutionId: string, authUserId: string, examinationId: string
): Promise<ExaminationClassOption[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExaminationClassOption>(
      `select distinct c.id, c.name
         from exam_classes ec
         join classes c on c.id = ec.class_id
        where ec.examination_id = $1
        order by c.name`,
      [examinationId]
    );
    return rows;
  });
}

export async function getResults(institutionId: string, authUserId: string, examinationId: string): Promise<ResultRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ResultRow>(
      `select r.student_id, s.full_name as student_name, r.total_marks, r.max_total_marks,
              r.percentage, gb.grade_label, r.rank
         from results r
         join students s on s.id = r.student_id
         left join grade_bands gb on gb.id = r.grade_band_id
        where r.examination_id = $1
        order by r.percentage desc`,
      [examinationId]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// §Student Profile feature ("Academics" tab / exam-report pie chart) — the
// one per-student-per-SUBJECT marks getter this module was missing;
// getMarksGrid() above is per-subject-all-students, getResults() is
// per-examination-all-students' TOTALS — neither breaks one student's marks
// down by subject, which is exactly what the reference screenshot's pie
// chart needs.
// ---------------------------------------------------------------------------
export interface StudentSubjectMarkRow {
  subject_id: string;
  subject_name: string;
  marks_obtained: string | null; // numeric(6,2) — comes back as a string, same convention as MarkRow.marks_obtained above
  max_marks: string;
  is_absent: boolean;
}

export interface StudentExamReport {
  examination_id: string;
  examination_name: string;
  subjects: StudentSubjectMarkRow[];
}

/** Defaults to this student's most recent examination with any
 *  approved/locked mark on record (pass an explicit examinationId to look at
 *  a specific one instead — e.g. a dropdown on the Academics tab). Returns
 *  null when the student has no marks anywhere yet, so the caller can show
 *  an empty state instead of a misleading all-zero chart. */
export async function getStudentExamReport(
  institutionId: string, authUserId: string, studentId: string, examinationId?: string
): Promise<StudentExamReport | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    let examId = examinationId ?? null;
    if (!examId) {
      const { rows } = await scoped.query<{ id: string }>(
        `select distinct e.id, coalesce(e.start_date, e.created_at::date) as sort_date
           from examinations e
           join exam_subjects es on es.examination_id = e.id
           join marks m on m.exam_subject_id = es.id
          where m.student_id = $1 and m.entry_status in ('approved','locked')
          order by sort_date desc limit 1`,
        [studentId]
      );
      examId = rows[0]?.id ?? null;
    }
    if (!examId) return null;

    const { rows: examRows } = await scoped.query<{ name: string }>(
      "select name from examinations where id = $1", [examId]
    );
    if (examRows.length === 0) return null;

    const { rows: subjectRows } = await scoped.query<StudentSubjectMarkRow>(
      `select sub.id as subject_id, sub.name as subject_name, m.marks_obtained, es.max_marks,
              coalesce(m.is_absent, false) as is_absent
         from exam_subjects es
         join subjects sub on sub.id = es.subject_id
         left join marks m
           on m.exam_subject_id = es.id and m.student_id = $2 and m.entry_status in ('approved','locked')
        where es.examination_id = $1
        order by sub.name`,
      [examId, studentId]
    );
    return { examination_id: examId, examination_name: examRows[0].name, subjects: subjectRows };
  });
}

// ---------------------------------------------------------------------------
// Home page widgets ("Institution-wide Pass rate trend (across exams in %)"
// and "Marks entry status of recent exam")
// ---------------------------------------------------------------------------
export interface RecentExaminationSummary { id: string; name: string }

/** The examination most likely to be "the recent exam" a Home page widget
 *  means — same "most recently created" ordering listExaminations() already
 *  uses, just narrowed to one row. */
export async function getMostRecentExamination(institutionId: string, authUserId: string): Promise<RecentExaminationSummary | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<RecentExaminationSummary>(
      `select id, name from examinations order by created_at desc limit 1`
    );
    return rows[0] ?? null;
  });
}

export interface PassRateTrendPoint { examinationId: string; examinationName: string; percentage: number }

/** "Institution-wide Pass rate trend (across exams in %)" — a student
 *  "passes" an examination here if every one of their approved/locked,
 *  non-absent marks meets that subject's own pass_marks (the same
 *  definition results/report cards already imply per-subject, just rolled
 *  up to "passed everything"). Only examinations that already have at least
 *  one computed result (computeResults() has been run) are included — an
 *  examination still in progress isn't a 0% data point, it's just not part
 *  of the trend yet. Ordered oldest-to-newest (left-to-right on a trend
 *  chart), most recent `limit` examinations. */
export async function getInstitutionPassRateTrend(institutionId: string, authUserId: string, limit = 5): Promise<PassRateTrendPoint[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; name: string; total: string; passed: string }>(
      `select e.id, e.name,
              count(distinct r.student_id) as total,
              count(distinct r.student_id) filter (
                where not exists (
                  select 1 from marks m
                    join exam_subjects es2 on es2.id = m.exam_subject_id
                   where es2.examination_id = e.id
                     and m.student_id = r.student_id
                     and m.entry_status in ('approved', 'locked')
                     and m.is_absent = false
                     and m.marks_obtained < es2.pass_marks
                )
              ) as passed
         from examinations e
         join results r on r.examination_id = e.id
        group by e.id, e.name, e.start_date, e.created_at
       having count(distinct r.student_id) > 0
        order by coalesce(e.start_date, e.created_at::date) desc
        limit $1`,
      [limit]
    );
    return rows
      .map((r) => ({
        examinationId: r.id, examinationName: r.name,
        percentage: Number(r.total) > 0 ? Math.round((Number(r.passed) / Number(r.total)) * 10000) / 100 : 0,
      }))
      .reverse();
  });
}
