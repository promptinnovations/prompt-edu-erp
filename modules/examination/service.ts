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
