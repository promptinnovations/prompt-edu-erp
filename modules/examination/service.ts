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
import { getDbClient, type DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { sortRoster, sortClasses } from "../../services/academic/roster-order";
import { resultAnalysisTag, safeRevalidateTag } from "../../services/cache/tags";

export interface ExamTypeRecord { id: string; code: string; name: string; category: string | null; periodicity: string | null; is_daily_assessment: boolean }
export interface ExaminationRecord {
  id: string; name: string; status: string; exam_type_id: string;
  academic_year_id: string; term_id: string | null; start_date: string | null; end_date: string | null;
  grade_scale_id: string | null;
  // Migration 0055 — only populated by getExamination() (every other
  // examinations select is left untouched, incl. the Daily Assessment path).
  overall_pass_pct?: string | null;
  finalized_at?: string | null;
  ce_enabled?: boolean;
  ce_mode?: "total" | "components";
}
export interface ExamSubjectRecord { id: string; examination_id: string; subject_id: string; max_marks: string; pass_marks: string }
export interface MarkRow {
  student_id: string; student_name: string; admission_number: string;
  roll_number: number | null; gender: string | null; section_name: string | null;
  mark_id: string | null; marks_obtained: string | null; is_absent: boolean; entry_status: string | null;
}
export interface GradeBandRecord { id: string; min_percent: string; max_percent: string; grade_label: string; grade_point: string | null; color: string | null }
export interface ResultRow {
  student_id: string; student_name: string; total_marks: string; max_total_marks: string;
  percentage: string; grade_label: string | null; rank: number | null;
  /** Stored §8 overall pass (computeStudentResult()) — readers must use this,
   *  never re-derive pass/fail from percentage. */
  is_pass: boolean | null;
  failed_subject_count: number; absent_subject_count: number;
  pass_threshold_pct: string | null;
  is_frozen: boolean;
}

// ---------------------------------------------------------------------------
// Exam types (config)
// ---------------------------------------------------------------------------
// category is free text ("Islamic", "Academic", or anything an institution
// wants) — never a hard-coded enum (§K), just an optional grouping label an
// admin can filter/sort the Create Exam dropdown by.
const examTypeSchema = z.object({
  code: z.string().min(1).max(50), name: z.string().min(1).max(150),
  category: z.string().max(100).nullable().optional(),
  periodicity: z.string().max(100).nullable().optional(),
});

// §Create-Examination follow-up ("type of exam in create exam is not
// working"): the "Exam type" dropdown on Create Examination is fed
// directly from this list with no zero-state handling, so an institution
// with no exam_types rows gets a silently-empty required <select> that
// can never be submitted -- confirmed live: 7 of 9 production
// institutions had zero rows, because nothing ever populated exam_types
// for a real institution except manual one-off testing (createInstitution()
// and provisionSksvbDefaults() both deliberately stop short of exam_types,
// see super-admin-service.ts's own doc comment). A universal, editable
// starting point, not a permanent decision -- any institution (school,
// college, islamic_school, madrasa alike) can rename/delete/add more via
// Settings > Grading's existing exam-type CRUD (§353) immediately after.
const DEFAULT_EXAM_TYPES: Array<[code: string, name: string]> = [
  ["term1", "Term 1 Exam"],
  ["term2", "Term 2 Exam"],
  ["final", "Final Exam"],
];

/** Lazily provisions DEFAULT_EXAM_TYPES the first time an institution has
 *  zero exam_types rows -- same one-time, never-repeated pattern as
 *  modules/staff/service.ts's listObservationCriteria() (see that
 *  function's own doc comment): only runs when the list is truly empty, so
 *  an admin's own additions/edits/deletions (even down to zero deliberately
 *  chosen types, which would be unusual but is technically possible) are
 *  never silently re-seeded over. */
const EXAM_TYPES_SELECT = "select id, code, name, category, periodicity, is_daily_assessment from exam_types order by category nulls last, name";

export async function listExamTypes(institutionId: string, authUserId: string): Promise<ExamTypeRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    let { rows } = await scoped.query<ExamTypeRecord>(EXAM_TYPES_SELECT);
    if (rows.length === 0) {
      for (const [code, name] of DEFAULT_EXAM_TYPES) {
        await scoped.query(
          `insert into exam_types (institution_id, code, name) values ($1, $2, $3) on conflict (institution_id, code) do nothing`,
          [institutionId, code, name]
        );
      }
      rows = (await scoped.query<ExamTypeRecord>(EXAM_TYPES_SELECT)).rows;
    }
    // Daily Assessment self-heal (§Daily Assessment "Add Daily Assessment
    // as a new Exam Type in Exam Create") -- runs independently of the
    // zero-row seed above, because an institution created (or already
    // populated with its own exam types) before this feature shipped would
    // otherwise never gain the Daily Assessment type at all: a one-time
    // migration backfill only reaches institutions that already existed at
    // migration time (the exact gap already hit once this project, for the
    // accounts_staff role -- see migration 0045's doc comment). Self-heal-
    // on-read instead guarantees every institution, past or future, sees
    // exactly one is_daily_assessment=true row the first time this runs.
    if (!rows.some((r) => r.is_daily_assessment)) {
      await scoped.query(
        `insert into exam_types (institution_id, code, name, periodicity, is_daily_assessment)
         values ($1, 'daily_assessment', 'Daily Assessment', 'Daily', true)
         on conflict (institution_id, code) do update set is_daily_assessment = true`,
        [institutionId]
      );
      rows = (await scoped.query<ExamTypeRecord>(EXAM_TYPES_SELECT)).rows;
    }
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
      `insert into exam_types (institution_id, code, name, category, periodicity) values ($1, $2, $3, $4, $5) returning id, code, name, category, periodicity, is_daily_assessment`,
      [institutionId, data.code, data.name, data.category ?? null, data.periodicity ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "exam_types", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const updateExamTypeSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  category: z.string().max(100).nullable().optional(),
  periodicity: z.string().max(100).nullable().optional(),
});
export async function updateExamType(
  institutionId: string, authUserId: string, userId: string, examTypeId: string, input: z.infer<typeof updateExamTypeSchema>
): Promise<ExamTypeRecord> {
  const data = updateExamTypeSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExamTypeRecord>(
      `update exam_types set name = coalesce($2, name), category = $3, periodicity = $4 where id = $1 returning id, code, name, category, periodicity, is_daily_assessment`,
      [examTypeId, data.name ?? null, data.category ?? null, data.periodicity ?? null]
    );
    if (!rows[0]) throw new Error("Exam type not found.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "examination", entityType: "exam_types", entityId: examTypeId, after: rows[0] });
    return rows[0];
  });
}

/** Guarded like deleteAchievementCategory()/deleteGradeScale() — a real
 *  examination already created against this type (examinations.exam_type_id
 *  has no ON DELETE clause) must block deletion with a clear message
 *  instead of surfacing a raw FK error. */
export async function deleteExamType(institutionId: string, authUserId: string, userId: string, examTypeId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: used } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from examinations where exam_type_id = $1", [examTypeId]
    );
    if (Number(used[0]?.count ?? 0) > 0) throw new Error("This exam type has examinations recorded against it and can't be deleted.");
    const { rows } = await scoped.query("delete from exam_types where id = $1 returning id", [examTypeId]);
    if (rows.length === 0) throw new Error("Exam type not found.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "exam_types", entityId: examTypeId });
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
      "select id, min_percent, max_percent, grade_label, grade_point, color from grade_bands where grade_scale_id = $1 order by min_percent desc",
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
export interface GradeScaleRecord { id: string; name: string; is_default: boolean; curriculum: string | null }

export async function listGradeScales(institutionId: string, authUserId: string): Promise<GradeScaleRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<GradeScaleRecord>("select id, name, is_default, curriculum from grade_scales order by name");
    return rows;
  });
}

const createGradeScaleSchema = z.object({
  name: z.string().min(1).max(150), isDefault: z.boolean().optional(),
  // Free-text curriculum name shown in the scale picker (§K — never an
  // enum, so a fully custom scale can be named anything). Presets set this
  // to e.g. "Kerala State Curriculum (SCERT)"; a hand-built custom scale
  // typically leaves it null.
  curriculum: z.string().max(100).nullable().optional(),
});

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
      `insert into grade_scales (institution_id, name, is_default, curriculum) values ($1, $2, $3, $4) returning id, name, is_default, curriculum`,
      [institutionId, data.name, data.isDefault ?? false, data.curriculum ?? null]
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
  // Hex color for this band, stored on the row itself — never keyed by
  // grade_label text (§K: labels differ per curriculum, "A+" vs "9" vs "I").
  // Optional here so admins can set it later via updateGradeBand(); presets
  // (provisionGradingPreset()) always populate it up front.
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export async function createGradeBand(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createGradeBandSchema>
): Promise<GradeBandRecord> {
  const data = createGradeBandSchema.parse(input);
  if (data.minPercent > data.maxPercent) throw new Error("Minimum percent cannot exceed maximum percent.");
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<GradeBandRecord>(
      `insert into grade_bands (institution_id, grade_scale_id, min_percent, max_percent, grade_label, grade_point, color)
       values ($1, $2, $3, $4, $5, $6, $7) returning id, min_percent, max_percent, grade_label, grade_point, color`,
      [institutionId, data.gradeScaleId, data.minPercent, data.maxPercent, data.gradeLabel, data.gradePoint ?? null, data.color ?? null]
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
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
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
         grade_point = case when $5 then $6 else grade_point end,
         color = case when $7 then $8 else color end
       where id = $1 returning id, min_percent, max_percent, grade_label, grade_point, color`,
      [gradeBandId, data.minPercent ?? null, data.maxPercent ?? null, data.gradeLabel ?? null,
        Object.prototype.hasOwnProperty.call(data, "gradePoint"), data.gradePoint ?? null,
        Object.prototype.hasOwnProperty.call(data, "color"), data.color ?? null]
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
// Grading primitives (Result Analysis & Reporting spec) — the ONLY two
// functions in this codebase allowed to contain grade/pass-fail logic.
// Every report, chart, or mark-entry screen that needs a grade label,
// band color, or pass/fail flag MUST call through these rather than
// re-deriving it inline — that is what keeps grading scale, band
// boundaries/colors, and pass percentage entirely institution-configured
// instead of hardcoded anywhere in report/chart code (§K).
// ---------------------------------------------------------------------------
export interface GradeLookupResult { id: string; label: string; color: string | null; gradePoint: string | null }

/** Resolves a percentage to its grade band under a given scale. Pure DB
 *  lookup against grade_bands — min_percent/max_percent/grade_label/color
 *  are always institution config, never literals here. Returns null if
 *  scaleId is null (examination has no grade scale attached) or no band
 *  covers this percentage (e.g. a gap left in a custom scale). */
export async function lookupGrade(scoped: DbClient, scaleId: string | null, pct: number): Promise<GradeLookupResult | null> {
  if (scaleId == null) return null;
  const { rows } = await scoped.query<{ id: string; grade_label: string; color: string | null; grade_point: string | null }>(
    `select id, grade_label, color, grade_point from grade_bands
      where grade_scale_id = $1 and $2 >= min_percent and $2 <= max_percent
      order by min_percent desc limit 1`,
    [scaleId, pct]
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, label: rows[0].grade_label, color: rows[0].color, gradePoint: rows[0].grade_point };
}

/** Binary pass/fail. §K: pass/fail semantics don't vary by curriculum
 *  (unlike grade labels/colors), so this comparison is the one legitimate
 *  hardcoded rule in the whole codebase — but passPct itself always comes
 *  from institution config (institutions.pass_pct, or a per-subject
 *  exam_subjects.pass_marks override), never a literal at the call site. */
export function isPass(pct: number, passPct: number): boolean {
  return pct >= passPct;
}

/** Fixed global pass/fail color pair. Legitimate constants (unlike grade
 *  band colors) because pass/fail is a single universal binary semantic —
 *  it doesn't get relabeled or recolored per curriculum the way grade
 *  bands do. Every pass/fail donut/badge in the UI imports these two. */
export const PASS_COLOR = "#059669";
export const FAIL_COLOR = "#dc2626";

// ---------------------------------------------------------------------------
// Pure result computation (EXAMINATION_SPEC §1.1, §1.5, §8, §CE) — regular
// examinations ONLY. Daily Assessment keeps its own, unchanged math
// (getDailyAssessmentConsolidatedResult() below still calls the original
// lookupGrade() exactly as before); nothing in this block is reachable
// from any Daily Assessment function.
//
// computeStudentResult() is THE single definition of a student's overall
// outcome for an examination. computeResults() persists it; every other
// reader (pass-rate trends, Result Analysis, report cards, consolidated
// sheet) reads the stored results row (is_pass etc.) instead of
// re-deriving pass/fail, and the per-track analytics summary calls this
// same function on a subset of subjects. No DB access here — unit-testable.
// ---------------------------------------------------------------------------

/** Platform default for examinations.overall_pass_pct when unset. */
export const DEFAULT_OVERALL_PASS_PCT = 50;

export interface GradeBandLike { min_percent: string | number; max_percent: string | number }

/** Resolves a percentage to a band, treating bands as half-open intervals
 *  [min_percent, next band's min_percent): the band with the greatest
 *  min_percent <= pct wins. This closes the gap an inclusive
 *  `pct between min and max` match leaves between stored boundaries like
 *  [80, 89.99] and [90, 100] (89.995 matched nothing). pct is first rounded
 *  to 2dp — the precision results.percentage is stored at — so the grade
 *  always agrees with the percentage printed next to it. Returns null only
 *  when pct is below every band's minimum (or there are no bands). */
export function resolveGradeBand<T extends GradeBandLike>(bands: readonly T[], pct: number): T | null {
  const p = Math.round(pct * 100) / 100;
  let best: T | null = null;
  for (const b of bands) {
    if (p >= Number(b.min_percent) && (best == null || Number(b.min_percent) > Number(best.min_percent))) best = b;
  }
  return best;
}

/** One gradable unit of a subject: the written/main paper (a `marks` row)
 *  or one CE component (a `ce_marks` row). §CE: a CE component is just
 *  another unit — the rules below never ask which kind it is. */
export interface ResultUnitDef { key: string; maxMarks: number }
export interface ResultSubjectDef {
  id: string;
  /** Pass marks relative to maxMarks of the main paper (exam_subjects.pass_marks);
   *  applied as a percentage (passMarks / mainMax) of whatever units were sat,
   *  so it scales correctly when CE is added or a unit is absent. null = use
   *  the institution's per-subject pass_pct. */
  passMarks: number | null;
  mainMaxMarks: number;
  units: ResultUnitDef[];
}
export interface ResultUnitEntry { key: string; marksObtained: number | null; isAbsent: boolean; entryStatus: string }
export interface StudentResultInput {
  subjects: ResultSubjectDef[];
  /** Keyed by ResultUnitDef.key; a missing key = blank (not yet entered). */
  entries: Map<string, ResultUnitEntry>;
  subjectPassPct: number;
  overallPassPct: number;
}
export interface StudentResultComputation {
  total: number; maxTotal: number; percentage: number;
  failedSubjectCount: number; absentSubjectCount: number;
  subjectsEntered: number; subjectsExpected: number;
  isPass: boolean; isProvisional: boolean;
}

/** §1.1 absence: an absent unit is excluded from BOTH the obtained total
 *  and the denominator — the student is judged only on what they sat. A
 *  subject whose every entered unit is absent (and nothing sat) is an
 *  absent subject: counted in absentSubjectCount, not in failedSubjectCount.
 *  §1.2 blanks: a unit with no row stays in the denominator (the result is
 *  provisional and reads as progress toward the final total, the §CS.4
 *  live-result convention) but contributes nothing and doesn't make its
 *  subject judgeable on its own. A subject is judged pass/fail only once at
 *  least one of its units was actually sat. If nothing was sat at all the
 *  denominator is 0 → percentage 0 (no division by zero) and isPass false.
 *  §8 overall: isPass = failedSubjects == 0 AND percentage >= overallPassPct
 *  (and at least one subject sat). */
export function computeStudentResult(input: StudentResultInput): StudentResultComputation {
  let total = 0, maxTotal = 0, failed = 0, absentSubjects = 0, entered = 0, satSubjects = 0;
  let provisional = false;
  for (const s of input.subjects) {
    let sObtained = 0, sMax = 0, sat = 0, absent = 0, rowsPresent = 0;
    for (const u of s.units) {
      const e = input.entries.get(u.key);
      // No row, or a legacy empty row (null value, not absent) = blank.
      if (!e || (!e.isAbsent && e.marksObtained == null)) { sMax += u.maxMarks; provisional = true; continue; }
      rowsPresent++;
      if (e.entryStatus !== "approved" && e.entryStatus !== "locked") provisional = true;
      if (e.isAbsent) { absent++; continue; }
      sObtained += e.marksObtained!; sMax += u.maxMarks; sat++;
    }
    total += sObtained; maxTotal += sMax;
    if (rowsPresent === s.units.length) entered++;
    if (sat > 0) {
      satSubjects++;
      const subjectPct = sMax > 0 ? (sObtained / sMax) * 100 : 0;
      const threshold = s.passMarks != null && s.mainMaxMarks > 0
        ? (s.passMarks / s.mainMaxMarks) * 100
        : input.subjectPassPct;
      if (!isPass(subjectPct, threshold)) failed++;
    } else if (absent > 0) {
      absentSubjects++;
    }
  }
  // Rounded to the 2dp results.percentage is stored at, so the stored
  // percentage, its grade (resolveGradeBand) and pass/fail all agree.
  const percentage = maxTotal > 0 ? Math.round((total / maxTotal) * 10000) / 100 : 0;
  return {
    total, maxTotal, percentage,
    failedSubjectCount: failed, absentSubjectCount: absentSubjects,
    subjectsEntered: entered, subjectsExpected: input.subjects.length,
    isPass: satSubjects > 0 && failed === 0 && isPass(percentage, input.overallPassPct),
    isProvisional: provisional,
  };
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
  // Only meaningful for a Daily Assessment exam type: which calendar
  // month's register to find-or-create, in place of the server's own
  // current_date. Never exposed on the manual Create Examination form —
  // set only by getOrCreateDailyAssessmentSession() below, so a bulk
  // import of a BACKDATED daily assessment mark (§506 "marks shall be
  // entered late also by choosing date") resolves to that date's own
  // month's register instead of always landing in the current month's.
  forDate: z.string().optional(),
  // §8 per-exam overall pass threshold (examinations.overall_pass_pct);
  // omitted/null = DEFAULT_OVERALL_PASS_PCT. Ignored for Daily Assessment.
  overallPassPct: z.number().min(0).max(100).nullable().optional(),
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
      `select id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id,
              overall_pass_pct, finalized_at::text as finalized_at, ce_enabled, ce_mode
         from examinations where id = $1`,
      [examinationId]
    );
    return rows[0] ?? null;
  });
}

export async function createExamination(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createExaminationSchema>,
  scopedClient?: DbClient // §Q.1, see modules/academic/service.ts's createClass() for why — needed so
                           // the "Examinations" bulk import entity type (modules/bulk/service.ts) can
                           // commit every row of a batch inside one transaction.
): Promise<ExaminationRecord> {
  const data = createExaminationSchema.parse(input);
  const run = async (scoped: DbClient) => {
    let gradeScaleId = data.gradeScaleId ?? null;
    if (!gradeScaleId) {
      const { rows: def } = await scoped.query<{ id: string }>("select id from grade_scales where is_default = true limit 1");
      gradeScaleId = def[0]?.id ?? null;
    }

    // §Daily Assessment "Maintain one monthly Daily Assessment Register" --
    // reuses the same Create Examination form/action every other exam type
    // goes through (no separate creation UI), but an examination whose
    // exam_type is flagged is_daily_assessment (migration 0048) gets two
    // special behaviours instead of the plain insert below: (1) its name
    // and start_date/end_date are always derived from the current calendar
    // month server-side (current_date, never the browser's clock) rather
    // than the free-text Name field, and (2) re-submitting Create
    // Examination for the same exam type + month returns the EXISTING
    // register row instead of inserting a duplicate, so "one register per
    // month" holds even if an admin (or a re-rendered form) submits twice.
    const { rows: etRows } = await scoped.query<{ is_daily_assessment: boolean }>(
      "select is_daily_assessment from exam_types where id = $1", [data.examTypeId]
    );
    if (etRows[0]?.is_daily_assessment) {
      // forDate (only ever set by getOrCreateDailyAssessmentSession() below,
      // for a bulk-imported backdated mark) resolves month math against
      // THAT date instead of the server's current_date, so a mark for the
      // 25th of a past month lands in that month's register rather than
      // always the current one.
      const { rows: existing } = await scoped.query<ExaminationRecord>(
        `select id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id
           from examinations
          where exam_type_id = $1 and academic_year_id = $2
            and date_trunc('month', start_date) = date_trunc('month', coalesce($3::date, current_date))`,
        [data.examTypeId, data.academicYearId, data.forDate ?? null]
      );
      if (existing[0]) return existing[0];

      const { rows: created } = await scoped.query<ExaminationRecord>(
        `insert into examinations (institution_id, exam_type_id, academic_year_id, term_id, name, grade_scale_id, start_date, end_date)
         values ($1, $2, $3, $4, 'Daily Assessment — ' || to_char(coalesce($6::date, current_date), 'FMMonth YYYY'), $5,
                 date_trunc('month', coalesce($6::date, current_date))::date,
                 (date_trunc('month', coalesce($6::date, current_date)) + interval '1 month - 1 day')::date)
         returning id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id`,
        [institutionId, data.examTypeId, data.academicYearId, data.termId ?? null, gradeScaleId, data.forDate ?? null]
      );
      await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "examinations", entityId: created[0].id, after: created[0] });
      return created[0];
    }

    // §CE: a regular exam inherits the institution's CE defaults
    // (institutions.ce_enabled_default/ce_mode_default, migration 0055);
    // editable per exam afterwards via updateExamination().
    const { rows } = await scoped.query<ExaminationRecord>(
      `insert into examinations (institution_id, exam_type_id, academic_year_id, term_id, name, grade_scale_id,
                                 overall_pass_pct, ce_enabled, ce_mode)
       select $1, $2, $3, $4, $5, $6, $7, i.ce_enabled_default, i.ce_mode_default
         from institutions i where i.id = $1
       returning id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id`,
      [institutionId, data.examTypeId, data.academicYearId, data.termId ?? null, data.name, gradeScaleId, data.overallPassPct ?? null]
    );
    if (!rows[0]) throw new Error("Institution not found.");
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "examinations", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

const updateExaminationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  academicYearId: z.string().uuid().optional(),
  /** §8 — null clears back to DEFAULT_OVERALL_PASS_PCT; undefined = unchanged. */
  overallPassPct: z.number().min(0).max(100).nullable().optional(),
  /** §CE on/off + mode for this exam; undefined = unchanged. */
  ceEnabled: z.boolean().optional(),
  ceMode: z.enum(["total", "components"]).optional(),
});

/** Edit a created examination's name and/or academic year — the only two
 *  fields the Create form itself lets an admin set (exam type is left
 *  alone once created: changing it could silently flip an ordinary exam
 *  into/out of the Daily Assessment special-case createExamination()
 *  handles above, which assumes its exam_type never changes after
 *  insert). §"add edit & remove button where they are required ... a
 *  created exam" follow-up. */
export async function updateExamination(
  institutionId: string, authUserId: string, userId: string, examinationId: string, input: z.infer<typeof updateExaminationSchema>
): Promise<ExaminationRecord> {
  const data = updateExaminationSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<ExaminationRecord>(
      `select id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id
         from examinations where id = $1`,
      [examinationId]
    );
    if (before.length === 0) throw new Error("Examination not found.");
    const { rows } = await scoped.query<ExaminationRecord>(
      `update examinations set
         name = coalesce($1, name),
         academic_year_id = coalesce($2, academic_year_id),
         overall_pass_pct = case when $4::boolean then $5::numeric else overall_pass_pct end,
         ce_enabled = coalesce($6, ce_enabled),
         ce_mode = coalesce($7, ce_mode),
         updated_at = now()
       where id = $3
       returning id, name, status, exam_type_id, academic_year_id, term_id, start_date, end_date, grade_scale_id`,
      [data.name ?? null, data.academicYearId ?? null, examinationId,
       data.overallPassPct !== undefined, data.overallPassPct ?? null, data.ceEnabled ?? null, data.ceMode ?? null]
    );
    // Threshold/CE changes alter results — recompute live (a finalized exam
    // is skipped inside computeResults(), so its snapshot is untouched).
    if (data.overallPassPct !== undefined || data.ceEnabled !== undefined || data.ceMode !== undefined) {
      await computeResultsScoped(scoped, institutionId, examinationId);
      safeRevalidateTag(resultAnalysisTag(institutionId, examinationId));
    }
    await recordAudit(scoped, {
      institutionId, userId, action: "update", module: "examination", entityType: "examinations",
      entityId: examinationId, before: before[0], after: rows[0],
    });
    return rows[0];
  });
}

/** Deletes a whole examination (and, via ON DELETE CASCADE, its exam_classes/
 *  exam_subjects/daily_assessments scope links) — refused once real data
 *  (any mark, any daily assessment mark, or any computed result) exists
 *  underneath it, the same "remove the data first" guard removeExamSubject()
 *  already uses, so a delete can never silently destroy marks a teacher
 *  already entered. */
export async function deleteExamination(institutionId: string, authUserId: string, userId: string, examinationId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: markCount } = await scoped.query<{ count: string }>(
      `select count(*)::text as count from marks m
         join exam_subjects es on es.id = m.exam_subject_id
        where es.examination_id = $1`,
      [examinationId]
    );
    if (Number(markCount[0]?.count ?? 0) > 0) throw new Error("Marks have already been entered for this exam — remove those first.");
    const { rows: dailyMarkCount } = await scoped.query<{ count: string }>(
      `select count(*)::text as count from daily_assessment_marks dam
         join daily_assessments da on da.id = dam.daily_assessment_id
        where da.examination_id = $1`,
      [examinationId]
    );
    if (Number(dailyMarkCount[0]?.count ?? 0) > 0) throw new Error("This register already has marks entered — remove those first.");
    const { rows: resultCount } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from results where examination_id = $1", [examinationId]
    );
    if (Number(resultCount[0]?.count ?? 0) > 0) throw new Error("Results have already been computed for this exam — remove those first.");
    const { rows } = await scoped.query("delete from examinations where id = $1 returning id", [examinationId]);
    if (rows.length === 0) throw new Error("Examination not found.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "examinations", entityId: examinationId });
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

/** §CS.2 "teachers should have mark entry to their respective class only"
 *  -- resolves the (examinationId, subjectId) an exam_subject row belongs
 *  to, so a caller that only has the examSubjectId (every mark-entry
 *  server action does) can check the acting teacher's class/subject scope
 *  against it. Kept minimal/read-only on purpose -- see
 *  services/scope/teacher-scope-service.ts's assertMarkEntryScope(), the
 *  only intended caller. */
export async function getExamSubjectRef(
  institutionId: string, authUserId: string, examSubjectId: string
): Promise<{ examinationId: string; subjectId: string } | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ examination_id: string; subject_id: string }>(
      "select examination_id, subject_id from exam_subjects where id = $1", [examSubjectId]
    );
    return rows[0] ? { examinationId: rows[0].examination_id, subjectId: rows[0].subject_id } : null;
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

/** §418 "confirm scope of exam" — full rows (not just class ids, unlike
 *  getExamCoveredClassIds() below, which is a narrower helper for teacher
 *  scoping) so the exam detail page can actually list which classes/
 *  divisions are already linked instead of only offering an add form with
 *  no visible result (§418's own "make user friendly" ask — the previous
 *  UI had no way to see or undo what had already been linked). */
export interface ExamClassRow { id: string; class_id: string; section_id: string | null; class_name: string; section_name: string | null; stage: string | null }
export async function listExamClasses(institutionId: string, authUserId: string, examinationId: string): Promise<ExamClassRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ExamClassRow>(
      `select ec.id, ec.class_id, ec.section_id, c.name as class_name, s.name as section_name, c.stage
         from exam_classes ec
         join classes c on c.id = ec.class_id
         left join sections s on s.id = ec.section_id
        where ec.examination_id = $1`,
      [examinationId]
    );
    // Section -> GRADE order, then division (stable sort keeps the
    // division ordering applied first) -- §users-roles follow-up.
    return sortClasses([...rows].sort((a, b) => (a.section_name ?? "").localeCompare(b.section_name ?? "")));
  });
}

export async function removeExamClass(institutionId: string, authUserId: string, userId: string, examClassId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query("delete from exam_classes where id = $1 returning id", [examClassId]);
    if (rows.length === 0) throw new Error("This class/division isn't linked to the exam.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "exam_classes", entityId: examClassId });
  });
}

/** Guarded like deleteExamType() — a subject with marks already entered
 *  against it can't be silently unlinked (that would orphan real mark
 *  data); the admin must be told to remove the marks first instead. */
export async function removeExamSubject(institutionId: string, authUserId: string, userId: string, examSubjectId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: used } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from marks where exam_subject_id = $1", [examSubjectId]
    );
    if (Number(used[0]?.count ?? 0) > 0) throw new Error("Marks have already been entered for this subject — remove those first.");
    const { rows } = await scoped.query("delete from exam_subjects where id = $1 returning id", [examSubjectId]);
    if (rows.length === 0) throw new Error("This subject isn't linked to the exam.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "exam_subjects", entityId: examSubjectId });
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
/** §CS.2 "mark entry status also should be shown class wise" -- one row
 *  per (subject, class) instead of collapsing every class an exam_subject
 *  covers into a single subject-wide count. Grouped by class_id (not
 *  section_id) even when an exam_classes row is section-specific, since
 *  "class wise" here means the class (e.g. "Class 5"), not each division --
 *  the page below groups these rows into a subject list per class.
 */
export interface MarkEntryStatusRow {
  exam_subject_id: string; subject_id: string; subject_name: string; max_marks: string; pass_marks: string;
  class_id: string; class_name: string; stage: string | null;
  expected: number; entered: number;
}

export async function getMarkEntryStatus(institutionId: string, authUserId: string, examinationId: string): Promise<MarkEntryStatusRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<MarkEntryStatusRow>(
      `select es.id as exam_subject_id, es.subject_id, sub.name as subject_name, es.max_marks, es.pass_marks,
              ec.class_id, cl.name as class_name, cl.stage,
              count(distinct se.student_id) as expected,
              count(distinct m.student_id) as entered
         from exam_subjects es
         join examinations e on e.id = es.examination_id
         join subjects sub on sub.id = es.subject_id
         join exam_classes ec on ec.examination_id = es.examination_id
         join classes cl on cl.id = ec.class_id
         -- §1.4 roster: the exam's OWN academic year only (a promoted
         -- student keeps last year's enrollment row active as history) and
         -- never a withdrawn (deleted) student.
         join student_enrollments se on se.class_id = ec.class_id
              and (ec.section_id is null or se.section_id = ec.section_id) and se.status = 'active'
              and se.academic_year_id = e.academic_year_id
         join students st on st.id = se.student_id and st.status <> 'withdrawn'
         left join marks m on m.exam_subject_id = es.id and m.student_id = se.student_id
        where es.examination_id = $1
          -- §CS.1 "are the subjects allocated class wise?" -- a class only counts
          -- toward a subject's expected roster if class_subjects actually links
          -- that class to that subject. A class with NO class_subjects rows at
          -- all (never configured) falls back to "counts for every subject" so
          -- institutions that haven't set up class_subjects keep prior behavior.
          and (
            not exists (select 1 from class_subjects cs2 where cs2.institution_id = es.institution_id and cs2.class_id = ec.class_id)
            or exists (select 1 from class_subjects cs2 where cs2.institution_id = es.institution_id and cs2.class_id = ec.class_id and cs2.subject_id = es.subject_id)
          )
        group by es.id, es.subject_id, sub.name, es.max_marks, es.pass_marks, ec.class_id, cl.name, cl.stage
        order by sub.name`,
      [examinationId]
    );
    return sortClasses(rows.map((r) => ({ ...r, expected: Number(r.expected), entered: Number(r.entered) })));
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
              se.roll_number, s.gender, sec.name as section_name,
              m.id as mark_id, m.marks_obtained, coalesce(m.is_absent, false) as is_absent, m.entry_status
         from exam_subjects es
         join examinations e on e.id = es.examination_id
         join exam_classes ec on ec.examination_id = es.examination_id
         -- §1.4 roster: exam's own academic year, active enrollment, not withdrawn.
         join student_enrollments se on se.class_id = ec.class_id
              and (ec.section_id is null or se.section_id = ec.section_id) and se.status = 'active'
              and se.academic_year_id = e.academic_year_id
         join students s on s.id = se.student_id and s.status <> 'withdrawn'
         left join sections sec on sec.id = se.section_id
         left join marks m on m.exam_subject_id = es.id and m.student_id = s.id
        where es.id = $1
          -- §CS.1 same class_subjects gate as getMarkEntryStatus() above -- a
          -- student's class must actually teach this subject (per class_subjects)
          -- to appear on the marks-entry grid, unless that class has no
          -- class_subjects rows configured at all (then it's ungated, same as before).
          and (
            not exists (select 1 from class_subjects cs2 where cs2.institution_id = es.institution_id and cs2.class_id = ec.class_id)
            or exists (select 1 from class_subjects cs2 where cs2.institution_id = es.institution_id and cs2.class_id = ec.class_id and cs2.subject_id = es.subject_id)
          )
        group by s.id, s.full_name, s.admission_number, se.roll_number, s.gender, sec.name, m.id, m.marks_obtained, m.is_absent, m.entry_status`,
      [examSubjectId]
    );
    // Division -> roll number order (§users-roles follow-up) -- exam_classes
    // can cover every division of a class (ec.section_id null), so this
    // must sort ACROSS divisions too, not just within one.
    return sortRoster(rows.map((r) => ({ ...r, full_name: r.student_name })));
  });
}

const markEntrySchema = z.array(
  z.object({
    studentId: z.string().uuid(),
    marksObtained: z.number().nullable(),
    isAbsent: z.boolean().default(false),
  })
);

/** §1.6 — once an examination is finalized its results are an immutable
 *  snapshot; refuse ordinary mark writes against it so the marks grid can't
 *  drift from the frozen report card. (computeResults() independently
 *  refuses to touch a finalized exam, so even a write that bypasses this —
 *  a direct SQL fix, a bulk import — can't change the snapshot.) */
async function assertExamSubjectNotFinalized(scoped: DbClient, examSubjectId: string): Promise<void> {
  const { rows } = await scoped.query<{ finalized: boolean }>(
    `select e.finalized_at is not null as finalized
       from exam_subjects es join examinations e on e.id = es.examination_id where es.id = $1`,
    [examSubjectId]
  );
  if (rows[0]?.finalized) throw new Error("This examination has been finalized — its results are locked.");
}

/** Bulk mark entry — only touches marks still in 'draft' (or not yet created). Editing
 *  an already-submitted/verified/approved/locked mark must go through correctMark(). */
export async function enterMarks(
  institutionId: string, authUserId: string, userId: string, examSubjectId: string, entries: z.infer<typeof markEntrySchema>
): Promise<{ updated: number; skippedLocked: number }> {
  const data = markEntrySchema.parse(entries);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await assertExamSubjectNotFinalized(scoped, examSubjectId);
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
      // §1.2: a blank, Present cell is "not entered yet" — never a row.
      // Blanking a previously saved draft value clears it (row removed), so
      // Mark Entry Status and the live result both see it as not entered.
      if (!e.isAbsent && e.marksObtained == null) {
        if (existing.length > 0) {
          await scoped.query("delete from marks where id = $1 and entry_status = 'draft'", [existing[0].id]);
          updated++;
        }
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

/** §CS.4 "as mark is started entering, it should start see in result
 *  analysis" -- enterMarks() itself runs inside withInstitutionContext()
 *  above and returns before this call, so recomputeExaminationResults()
 *  (which opens its own scoped connection) runs after that transaction has
 *  committed. Wrapped in try/catch so a recompute hiccup never turns a
 *  successful mark save into a user-facing error -- the marks row is the
 *  source of truth and is already saved; Result Analysis will catch up on
 *  the next successful recompute (e.g. the next save). */
export async function enterMarksAndRecompute(
  institutionId: string, authUserId: string, userId: string, examSubjectId: string, entries: z.infer<typeof markEntrySchema>
): Promise<{ updated: number; skippedLocked: number }> {
  const result = await enterMarks(institutionId, authUserId, userId, examSubjectId, entries);
  if (result.updated > 0) {
    try {
      await recomputeExaminationResults(institutionId, authUserId, examSubjectId);
    } catch {
      // best-effort live recompute, see doc comment above
    }
  }
  return result;
}

/** Removes one student's mark entry entirely (as opposed to correctMark(),
 *  which changes its value but keeps it as a row + history) — only while
 *  it's still 'draft', the same boundary enterMarks() itself enforces, so
 *  a submitted/verified/approved/locked mark can't be silently erased
 *  outside the correction-history path. §"add edit & remove button ...
 *  student added mark entered" follow-up. */
export async function deleteMark(institutionId: string, authUserId: string, userId: string, markId: string): Promise<void> {
  await deleteMarkAndReturnSubject(institutionId, authUserId, userId, markId);
}

async function deleteMarkAndReturnSubject(institutionId: string, authUserId: string, userId: string, markId: string): Promise<string> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; entry_status: string; exam_subject_id: string }>(
      "select id, entry_status, exam_subject_id from marks where id = $1", [markId]
    );
    if (rows.length === 0) throw new Error("Mark not found.");
    if (rows[0].entry_status !== "draft") throw new Error("This mark has already been submitted — use Correct instead of Remove.");
    await scoped.query("delete from marks where id = $1", [markId]);
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "marks", entityId: markId });
    return rows[0].exam_subject_id;
  });
}

/** §CS.4 -- same live-recompute rationale as enterMarksAndRecompute() above,
 *  for the "Remove" action. */
export async function deleteMarkAndRecompute(institutionId: string, authUserId: string, userId: string, markId: string): Promise<void> {
  const examSubjectId = await deleteMarkAndReturnSubject(institutionId, authUserId, userId, markId);
  try {
    await recomputeExaminationResults(institutionId, authUserId, examSubjectId);
  } catch {
    // best-effort live recompute, see doc comment above
  }
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
    // §CE: a subject's CE component marks move through the SAME workflow
    // as its written marks (one Submit/Verify/Approve/Lock per subject).
    const { rows: ceRows } = await scoped.query(
      `update ce_marks set entry_status = $1, updated_at = now()
         where entry_status = $3
           and ce_component_id in (select id from exam_ce_components where exam_subject_id = $2)
         returning id`,
      [to, examSubjectId, from]
    );
    return rows.length + ceRows.length;
  });
}

export const submitMarks = (institutionId: string, authUserId: string, examSubjectId: string, userId: string) =>
  transitionMarks(institutionId, authUserId, examSubjectId, "draft", "submitted", null, userId);

export const verifyMarks = (institutionId: string, authUserId: string, examSubjectId: string, userId: string) =>
  transitionMarks(institutionId, authUserId, examSubjectId, "submitted", "verified", "verified_by", userId);

/** Approving/locking a subject's marks is exactly the point at which a
 *  student's result CAN newly become complete (§28 "once marks are
 *  approved, they feed the analytics engine") — so both transitions
 *  auto-recompute results for the whole examination afterward via
 *  recomputeExaminationResults(), satisfying the Result Analysis spec's
 *  "live recompute on save, no separate publish/compute step" requirement.
 *  No-op (harmlessly) if this subject's transition didn't actually move
 *  any rows. */
export async function approveMarks(institutionId: string, authUserId: string, examSubjectId: string, userId: string): Promise<number> {
  const count = await transitionMarks(institutionId, authUserId, examSubjectId, "verified", "approved", "approved_by", userId);
  if (count > 0) await recomputeExaminationResults(institutionId, authUserId, examSubjectId);
  return count;
}

export async function lockMarks(institutionId: string, authUserId: string, examSubjectId: string, userId: string): Promise<number> {
  const count = await transitionMarks(institutionId, authUserId, examSubjectId, "approved", "locked", null, userId);
  if (count > 0) await recomputeExaminationResults(institutionId, authUserId, examSubjectId);
  return count;
}

/** Looks up the examination an exam_subject belongs to and re-runs
 *  computeResults() + refreshAnalyticsViews() for it — the shared tail end
 *  of both approveMarks() and lockMarks() (and safe to call after
 *  correctMark() too, for the same "no manual publish step" reason). Swallows
 *  refreshAnalyticsViews() failures rather than letting a matview hiccup
 *  block the mark-approval transition itself; computeResults() (the live
 *  `results` table) is the part that must not silently fail. */
async function recomputeExaminationResults(institutionId: string, authUserId: string, examSubjectId: string): Promise<void> {
  const db = await getDbClient();
  const examinationId = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ examination_id: string }>(
      "select examination_id from exam_subjects where id = $1", [examSubjectId]
    );
    return rows[0]?.examination_id ?? null;
  });
  if (!examinationId) return;
  await computeResults(institutionId, authUserId, examinationId);
  try {
    const { refreshAnalyticsViews } = await import("../analytics/service");
    await refreshAnalyticsViews();
  } catch {
    // Matview refresh is best-effort here; results table (the live source
    // of truth for School/Section/Grade/Class-wise reports) is already
    // correct regardless.
  }
}

/** Corrects an already approved/locked mark, preserving history (§28 "correction history").
 *  Caller (server action) must check the marks.lock permission before invoking this — it
 *  deliberately bypasses the normal draft-only edit path in enterMarks(). */
export async function correctMark(
  institutionId: string, authUserId: string, userId: string, markId: string, newValue: number | null, reason: string
): Promise<void> {
  const db = await getDbClient();
  const examSubjectId = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ marks_obtained: string | null; exam_subject_id: string }>(
      "select marks_obtained, exam_subject_id from marks where id = $1", [markId]
    );
    if (rows.length === 0) throw new Error("Mark not found");
    await assertExamSubjectNotFinalized(scoped, rows[0].exam_subject_id);
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
    return rows[0].exam_subject_id;
  });
  // A correction to an already-approved/locked mark should reflect
  // immediately in results/reports too (§28, Result Analysis spec "live
  // recompute, no publish step") — same tail-end as approveMarks/lockMarks.
  await recomputeExaminationResults(institutionId, authUserId, examSubjectId);
}

// ---------------------------------------------------------------------------
// Continuous Evaluation (EXAMINATION_SPEC §2 / §CE) — regular exams only,
// entirely separate from Daily Assessment (no shared tables or functions).
// Schema: migration 0055 (exam_ce_components + ce_marks; see its header for
// why CE doesn't live in `marks`). Config: examinations.ce_enabled/ce_mode,
// defaulted from institutions.ce_enabled_default/ce_mode_default.
//   TOTAL mode      — one component named "CE" per exam_subject; its
//                     max_marks IS the subject's CE max.
//   COMPONENTS mode — several named components; CE max = their sum.
// CE marks feed computeResults() as ordinary units of their subject (same
// absent/blank/denominator rules as the written paper).
// ---------------------------------------------------------------------------
export interface CeComponentRecord { id: string; exam_subject_id: string; name: string; max_marks: string; sort_order: number }
export interface CeMarkRecord { student_id: string; ce_component_id: string; marks_obtained: string | null; is_absent: boolean; entry_status: string }

export const TOTAL_MODE_CE_COMPONENT_NAME = "CE";

/** Institution-level CE defaults (copied onto each new regular exam). */
export async function setInstitutionCeDefaults(
  institutionId: string, authUserId: string, userId: string, input: { enabled: boolean; mode: "total" | "components" }
): Promise<void> {
  const data = z.object({ enabled: z.boolean(), mode: z.enum(["total", "components"]) }).parse(input);
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      "update institutions set ce_enabled_default = $1, ce_mode_default = $2 where id = $3",
      [data.enabled, data.mode, institutionId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "examination", entityType: "institutions", entityId: institutionId, after: { ce_enabled_default: data.enabled, ce_mode_default: data.mode } });
  });
}

export async function getInstitutionCeDefaults(institutionId: string, authUserId: string): Promise<{ enabled: boolean; mode: "total" | "components" }> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ ce_enabled_default: boolean; ce_mode_default: "total" | "components" }>(
      "select ce_enabled_default, ce_mode_default from institutions where id = $1", [institutionId]
    );
    return { enabled: rows[0]?.ce_enabled_default ?? false, mode: rows[0]?.ce_mode_default ?? "total" };
  });
}

/** Every CE component of every subject of one examination. */
export async function listCeComponents(institutionId: string, authUserId: string, examinationId: string): Promise<CeComponentRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<CeComponentRecord>(
      `select c.id, c.exam_subject_id, c.name, c.max_marks, c.sort_order
         from exam_ce_components c join exam_subjects es on es.id = c.exam_subject_id
        where es.examination_id = $1 order by c.sort_order, c.name`,
      [examinationId]
    );
    return rows;
  });
}

const ceComponentsSchema = z.array(z.object({ name: z.string().trim().min(1).max(100), maxMarks: z.number().positive() })).min(1);

/** Replaces one exam_subject's CE components. TOTAL mode accepts exactly
 *  one component (always stored under the name "CE"); COMPONENTS mode
 *  accepts one or more uniquely-named ones. A component that already has
 *  CE marks can't be dropped (remove the marks first — same guard
 *  removeExamSubject() uses); an existing one is updated in place by name. */
export async function setCeComponents(
  institutionId: string, authUserId: string, userId: string, examSubjectId: string,
  components: Array<{ name: string; maxMarks: number }>
): Promise<CeComponentRecord[]> {
  const parsed = ceComponentsSchema.parse(components);
  const db = await getDbClient();
  const result = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await assertExamSubjectNotFinalized(scoped, examSubjectId);
    const { rows: ex } = await scoped.query<{ examination_id: string; ce_enabled: boolean; ce_mode: "total" | "components" }>(
      `select e.id as examination_id, e.ce_enabled, e.ce_mode
         from exam_subjects es join examinations e on e.id = es.examination_id where es.id = $1`,
      [examSubjectId]
    );
    if (!ex[0]) throw new Error("Exam subject not found.");
    if (!ex[0].ce_enabled) throw new Error("Continuous Evaluation is not enabled for this examination.");
    let wanted = parsed;
    if (ex[0].ce_mode === "total") {
      if (parsed.length !== 1) throw new Error("CE is in Total mode — give exactly one CE maximum.");
      wanted = [{ name: TOTAL_MODE_CE_COMPONENT_NAME, maxMarks: parsed[0].maxMarks }];
    }
    const names = wanted.map((c) => c.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new Error("CE component names must be unique.");

    const { rows: existing } = await scoped.query<{ id: string; name: string; used: boolean }>(
      `select c.id, c.name, exists (select 1 from ce_marks m where m.ce_component_id = c.id) as used
         from exam_ce_components c where c.exam_subject_id = $1`,
      [examSubjectId]
    );
    for (const e of existing) {
      if (!names.includes(e.name.toLowerCase())) {
        if (e.used) throw new Error(`CE marks have already been entered for "${e.name}" — remove those first.`);
        await scoped.query("delete from exam_ce_components where id = $1", [e.id]);
      }
    }
    for (const [i, c] of wanted.entries()) {
      const match = existing.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
      if (match) {
        await scoped.query("update exam_ce_components set max_marks = $1, sort_order = $2 where id = $3", [c.maxMarks, i, match.id]);
      } else {
        await scoped.query(
          `insert into exam_ce_components (institution_id, exam_subject_id, name, max_marks, sort_order)
           values ($1, $2, $3, $4, $5)`,
          [institutionId, examSubjectId, c.name, c.maxMarks, i]
        );
      }
    }
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "examination", entityType: "exam_ce_components", entityId: examSubjectId, after: { components: wanted } });
    const { rows } = await scoped.query<CeComponentRecord>(
      "select id, exam_subject_id, name, max_marks, sort_order from exam_ce_components where exam_subject_id = $1 order by sort_order, name",
      [examSubjectId]
    );
    return rows;
  });
  await recomputeExaminationResults(institutionId, authUserId, examSubjectId);
  return result;
}

/** One exam_subject's CE components + every CE mark entered against them. */
export async function getCeMarksGrid(
  institutionId: string, authUserId: string, examSubjectId: string
): Promise<{ components: CeComponentRecord[]; marks: CeMarkRecord[] }> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: ex } = await scoped.query<{ ce_enabled: boolean }>(
      "select e.ce_enabled from exam_subjects es join examinations e on e.id = es.examination_id where es.id = $1", [examSubjectId]
    );
    if (!ex[0]?.ce_enabled) return { components: [], marks: [] };
    const { rows: components } = await scoped.query<CeComponentRecord>(
      "select id, exam_subject_id, name, max_marks, sort_order from exam_ce_components where exam_subject_id = $1 order by sort_order, name",
      [examSubjectId]
    );
    if (components.length === 0) return { components, marks: [] };
    const { rows: marks } = await scoped.query<CeMarkRecord>(
      "select student_id, ce_component_id, marks_obtained, is_absent, entry_status from ce_marks where ce_component_id = any($1::uuid[])",
      [components.map((c) => c.id)]
    );
    return { components, marks };
  });
}

const ceMarkEntrySchema = z.array(z.object({
  studentId: z.string().uuid(),
  componentId: z.string().uuid(),
  marksObtained: z.number().nullable(),
  isAbsent: z.boolean().default(false),
}));

/** Bulk CE mark entry — same rules as enterMarks(): draft-only, a blank
 *  Present cell is never a row (and clears a saved draft), absent stores
 *  no value. Also range-checks against the component's max. */
export async function enterCeMarks(
  institutionId: string, authUserId: string, userId: string, examSubjectId: string, entries: z.infer<typeof ceMarkEntrySchema>
): Promise<{ updated: number; skippedLocked: number }> {
  const data = ceMarkEntrySchema.parse(entries);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await assertExamSubjectNotFinalized(scoped, examSubjectId);
    const { rows: comps } = await scoped.query<{ id: string; max_marks: string }>(
      "select id, max_marks from exam_ce_components where exam_subject_id = $1", [examSubjectId]
    );
    const maxById = new Map(comps.map((c) => [c.id, Number(c.max_marks)]));
    let updated = 0, skippedLocked = 0;
    for (const e of data) {
      const max = maxById.get(e.componentId);
      if (max == null) throw new Error("CE component does not belong to this subject.");
      if (!e.isAbsent && e.marksObtained != null && (e.marksObtained < 0 || e.marksObtained > max)) {
        throw new Error(`CE mark must be between 0 and ${max}.`);
      }
      const { rows: existing } = await scoped.query<{ id: string; entry_status: string }>(
        "select id, entry_status from ce_marks where ce_component_id = $1 and student_id = $2", [e.componentId, e.studentId]
      );
      if (existing.length > 0 && existing[0].entry_status !== "draft") { skippedLocked++; continue; }
      if (!e.isAbsent && e.marksObtained == null) {
        if (existing.length > 0) {
          await scoped.query("delete from ce_marks where id = $1 and entry_status = 'draft'", [existing[0].id]);
          updated++;
        }
        continue;
      }
      await scoped.query(
        `insert into ce_marks (institution_id, ce_component_id, student_id, marks_obtained, is_absent, entry_status, entered_by)
         values ($1, $2, $3, $4, $5, 'draft', $6)
         on conflict (institution_id, ce_component_id, student_id)
         do update set marks_obtained = excluded.marks_obtained, is_absent = excluded.is_absent,
                        entered_by = excluded.entered_by, updated_at = now()
         where ce_marks.entry_status = 'draft'`,
        [institutionId, e.componentId, e.studentId, e.isAbsent ? null : e.marksObtained, e.isAbsent, userId]
      );
      updated++;
    }
    return { updated, skippedLocked };
  });
}

/** enterCeMarks() + the same best-effort live recompute enterMarksAndRecompute() does. */
export async function enterCeMarksAndRecompute(
  institutionId: string, authUserId: string, userId: string, examSubjectId: string, entries: z.infer<typeof ceMarkEntrySchema>
): Promise<{ updated: number; skippedLocked: number }> {
  const result = await enterCeMarks(institutionId, authUserId, userId, examSubjectId, entries);
  if (result.updated > 0) {
    try { await recomputeExaminationResults(institutionId, authUserId, examSubjectId); } catch { /* best-effort, see enterMarksAndRecompute() */ }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Results (§28 "once marks are approved, they feed the analytics engine")
// ---------------------------------------------------------------------------
/** Computes total/percentage/grade + pass-fail for every student who has
 *  AT LEAST ONE unit (written mark or CE component mark) entered for this
 *  examination — §CS.4 live results: a student gets a `results` row the
 *  moment their FIRST mark is saved, draft or otherwise, and that row keeps
 *  updating live as more subjects/statuses come in. `subjects_entered`/
 *  `subjects_expected`/`is_provisional` (migration 0054) let a reader tell
 *  a still-filling-in result apart from a complete one.
 *
 *  The math itself is computeStudentResult() above (the ONE pure definition,
 *  EXAMINATION_SPEC §1.5) — this function only loads inputs and persists:
 *   - §1.1 absent units are excluded from total AND denominator;
 *   - §1.2 blank (not-yet-entered) units stay in the denominator;
 *   - §8 overall pass = no failed subject AND percentage >=
 *     examinations.overall_pass_pct (DEFAULT_OVERALL_PASS_PCT if unset);
 *   - §8 grade via resolveGradeBand() (half-open bands, no boundary gaps);
 *   - §CE components are just more units of their subject.
 *  §1.6 freeze: a finalized examination is skipped entirely, and the upsert
 *  itself refuses to overwrite any row with is_frozen = true.
 *
 *  Called automatically after every mark save/delete as well as every
 *  submit/verify/approve/lock/correct transition, and safely re-runnable. */
export async function computeResults(institutionId: string, authUserId: string, examinationId: string): Promise<{ computed: number; skippedIncomplete: number }> {
  const db = await getDbClient();
  const out = await db.withInstitutionContext({ institutionId, authUserId }, (scoped) =>
    computeResultsScoped(scoped, institutionId, examinationId)
  );
  // Result Analysis reads (modules/analytics/service.ts) are cached
  // indefinitely until this exact tag is revalidated — this is that "until
  // there's a change" moment.
  safeRevalidateTag(resultAnalysisTag(institutionId, examinationId));
  return out;
}

/** Loads one examination's subjects (+ CE components when CE is enabled)
 *  as ResultSubjectDefs — shared by computeResultsScoped() and the
 *  per-track analytics summary so both see identical unit definitions. */
export async function loadResultSubjectDefs(
  scoped: DbClient, examinationId: string
): Promise<{ subjects: Array<ResultSubjectDef & { ceComponentIds: string[] }>; ceEnabled: boolean }> {
  const { rows: examRow } = await scoped.query<{ ce_enabled: boolean }>(
    "select ce_enabled from examinations where id = $1", [examinationId]
  );
  const ceEnabled = examRow[0]?.ce_enabled ?? false;
  const { rows: examSubjects } = await scoped.query<{ id: string; max_marks: string; pass_marks: string | null }>(
    "select id, max_marks, pass_marks from exam_subjects where examination_id = $1", [examinationId]
  );
  const { rows: comps } = ceEnabled && examSubjects.length > 0
    ? await scoped.query<{ id: string; exam_subject_id: string; max_marks: string }>(
        `select id, exam_subject_id, max_marks from exam_ce_components
          where exam_subject_id = any($1) order by sort_order, name`,
        [examSubjects.map((s) => s.id)]
      )
    : { rows: [] as Array<{ id: string; exam_subject_id: string; max_marks: string }> };
  const subjects = examSubjects.map((s) => {
    const mine = comps.filter((c) => c.exam_subject_id === s.id);
    return {
      id: s.id,
      passMarks: s.pass_marks == null ? null : Number(s.pass_marks),
      mainMaxMarks: Number(s.max_marks),
      units: [
        { key: `m:${s.id}`, maxMarks: Number(s.max_marks) },
        ...mine.map((c) => ({ key: `ce:${c.id}`, maxMarks: Number(c.max_marks) })),
      ],
      ceComponentIds: mine.map((c) => c.id),
    };
  });
  return { subjects, ceEnabled };
}

async function computeResultsScoped(
  scoped: DbClient, institutionId: string, examinationId: string
): Promise<{ computed: number; skippedIncomplete: number }> {
  const { rows: examRow } = await scoped.query<{ grade_scale_id: string | null; overall_pass_pct: string | null; finalized: boolean }>(
    "select grade_scale_id, overall_pass_pct, finalized_at is not null as finalized from examinations where id = $1", [examinationId]
  );
  if (!examRow[0] || examRow[0].finalized) return { computed: 0, skippedIncomplete: 0 };
  const gradeScaleId = examRow[0].grade_scale_id;
  const overallPassPct = examRow[0].overall_pass_pct == null ? DEFAULT_OVERALL_PASS_PCT : Number(examRow[0].overall_pass_pct);

  const { subjects } = await loadResultSubjectDefs(scoped, examinationId);
  if (subjects.length === 0) return { computed: 0, skippedIncomplete: 0 };

  const { rows: instRow } = await scoped.query<{ pass_pct: string }>(
    "select pass_pct from institutions where id = $1", [institutionId]
  );
  const subjectPassPct = Number(instRow[0]?.pass_pct ?? 35);

  const { rows: bands } = gradeScaleId
    ? await scoped.query<{ id: string; min_percent: string; max_percent: string; grade_label: string; color: string | null }>(
        "select id, min_percent, max_percent, grade_label, color from grade_bands where grade_scale_id = $1", [gradeScaleId]
      )
    : { rows: [] as Array<{ id: string; min_percent: string; max_percent: string; grade_label: string; color: string | null }> };

  // Every unit row that has a value or is explicitly absent, any status.
  const { rows: markRows } = await scoped.query<{ student_id: string; unit_key: string; marks_obtained: string | null; is_absent: boolean; entry_status: string }>(
    `select student_id, 'm:' || exam_subject_id as unit_key, marks_obtained, is_absent, entry_status
       from marks
      where exam_subject_id = any($1) and (marks_obtained is not null or is_absent = true)
     union all
     select student_id, 'ce:' || ce_component_id as unit_key, marks_obtained, is_absent, entry_status
       from ce_marks
      where ce_component_id = any($2::uuid[]) and (marks_obtained is not null or is_absent = true)`,
    [subjects.map((s) => s.id), subjects.flatMap((s) => s.ceComponentIds)]
  );

  const byStudent = new Map<string, Map<string, ResultUnitEntry>>();
  for (const m of markRows) {
    if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, new Map());
    byStudent.get(m.student_id)!.set(m.unit_key, {
      key: m.unit_key, marksObtained: m.marks_obtained == null ? null : Number(m.marks_obtained),
      isAbsent: m.is_absent, entryStatus: m.entry_status,
    });
  }

  let computed = 0;
  for (const [studentId, entries] of byStudent) {
    const r = computeStudentResult({ subjects, entries, subjectPassPct, overallPassPct });
    // No sat subject at all (e.g. absent everywhere) => no percentage to grade.
    const band = r.maxTotal > 0 ? resolveGradeBand(bands, r.percentage) : null;
    await scoped.query(
      `insert into results (institution_id, examination_id, student_id, total_marks, max_total_marks, percentage, grade_band_id,
                            grade_label, grade_color, is_pass, failed_subject_count, absent_subject_count, pass_threshold_pct,
                            subjects_entered, subjects_expected, is_provisional, computed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
       on conflict (institution_id, examination_id, student_id)
       do update set total_marks = excluded.total_marks, max_total_marks = excluded.max_total_marks,
                      percentage = excluded.percentage, grade_band_id = excluded.grade_band_id,
                      grade_label = excluded.grade_label, grade_color = excluded.grade_color,
                      is_pass = excluded.is_pass, failed_subject_count = excluded.failed_subject_count,
                      absent_subject_count = excluded.absent_subject_count, pass_threshold_pct = excluded.pass_threshold_pct,
                      subjects_entered = excluded.subjects_entered, subjects_expected = excluded.subjects_expected,
                      is_provisional = excluded.is_provisional, computed_at = now()
       where results.is_frozen = false`,
      [institutionId, examinationId, studentId, r.total, r.maxTotal, r.percentage, band?.id ?? null,
       band?.grade_label ?? null, band?.color ?? null, r.isPass, r.failedSubjectCount, r.absentSubjectCount, overallPassPct,
       r.subjectsEntered, r.subjectsExpected, r.isProvisional]
    );
    computed++;
  }
  return { computed, skippedIncomplete: 0 };
}

/** §1.6 grade freeze — the explicit "Finalize results" action. Distinct
 *  from ordinary live/provisional/published state: until this runs,
 *  results keep live-recomputing on every mark change (§CS.4); after it,
 *  every results row of the exam is an immutable snapshot
 *  (results.is_frozen, examinations.finalized_at) that computeResults()
 *  will never touch again — not on a grade-band edit, a threshold change,
 *  or a re-entered mark. Refuses Daily Assessment registers (they have no
 *  `results` rows and keep their own live math), an already-finalized exam,
 *  an exam with no results, and any exam that still has a provisional
 *  (incomplete or not-yet-approved) result. Irreversible by design. */
export async function finalizeExamination(
  institutionId: string, authUserId: string, userId: string, examinationId: string
): Promise<{ frozen: number }> {
  const db = await getDbClient();
  const out = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: ex } = await scoped.query<{ finalized: boolean; is_daily_assessment: boolean }>(
      `select e.finalized_at is not null as finalized, et.is_daily_assessment
         from examinations e join exam_types et on et.id = e.exam_type_id where e.id = $1`,
      [examinationId]
    );
    if (!ex[0]) throw new Error("Examination not found.");
    if (ex[0].is_daily_assessment) throw new Error("Daily Assessment registers can't be finalized.");
    if (ex[0].finalized) throw new Error("This examination is already finalized.");
    // One last live recompute so the snapshot reflects current marks/bands.
    await computeResultsScoped(scoped, institutionId, examinationId);
    const { rows: counts } = await scoped.query<{ total: string; provisional: string }>(
      `select count(*)::text as total, count(*) filter (where is_provisional)::text as provisional
         from results where examination_id = $1`,
      [examinationId]
    );
    if (Number(counts[0]?.total ?? 0) === 0) throw new Error("No results to finalize yet.");
    if (Number(counts[0]?.provisional ?? 0) > 0) {
      throw new Error(`${counts[0].provisional} result(s) are still provisional — every subject must be entered and approved/locked before finalizing.`);
    }
    const { rows: frozen } = await scoped.query(
      "update results set is_frozen = true, frozen_at = now() where examination_id = $1 and is_frozen = false returning id",
      [examinationId]
    );
    await scoped.query(
      "update examinations set finalized_at = now(), finalized_by = $2, status = 'finalized', updated_at = now() where id = $1",
      [examinationId, userId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "finalize", module: "examination", entityType: "examinations", entityId: examinationId, after: { frozen: frozen.length } });
    return { frozen: frozen.length };
  });
  safeRevalidateTag(resultAnalysisTag(institutionId, examinationId));
  return out;
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
  roll_number: number | null; gender: string | null; section_name: string | null;
  class_name: string | null;
  exam_subject_id: string; subject_name: string; max_marks: string; pass_marks: string;
  marks_obtained: string | null; is_absent: boolean;
  /** §CE breakdown for this cell — empty when CE is off for the exam or the
   *  subject has no CE components. Written mark stays in marks_obtained. */
  ce_components: MatrixCeCell[];
}
export interface MatrixCeCell { id: string; name: string; max_marks: string; marks_obtained: string | null; is_absent: boolean }

/** `classId` (§Page-6 follow-up "Consolidated Marks — select exam, class
 *  from dropdown") narrows to one of the exam's covered classes; omitted or
 *  empty means "every class this exam covers", the original behaviour. */
export async function getExaminationMarksMatrix(
  institutionId: string, authUserId: string, examinationId: string, classId?: string | null
): Promise<ExaminationMarksMatrixRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<Omit<ExaminationMarksMatrixRow, "ce_components">>(
      `select distinct se.student_id, s.full_name as student_name, s.admission_number,
              se.roll_number, s.gender, sec.name as section_name, c.name as class_name,
              es.id as exam_subject_id, sub.name as subject_name, es.max_marks, es.pass_marks,
              m.marks_obtained, coalesce(m.is_absent, false) as is_absent
         from exam_subjects es
         join examinations e on e.id = es.examination_id
         join subjects sub on sub.id = es.subject_id
         join exam_classes ec on ec.examination_id = es.examination_id
         -- §1.4 roster: exam's own academic year, active enrollment, not withdrawn.
         join student_enrollments se on se.class_id = ec.class_id
              and (ec.section_id is null or se.section_id = ec.section_id) and se.status = 'active'
              and se.academic_year_id = e.academic_year_id
         join students s on s.id = se.student_id and s.status <> 'withdrawn'
         left join sections sec on sec.id = se.section_id
         left join classes c on c.id = se.class_id
         left join marks m on m.exam_subject_id = es.id and m.student_id = se.student_id
        where es.examination_id = $1 and ($2::uuid is null or se.class_id = $2)
        order by sub.name`,
      [examinationId, classId || null]
    );
    // §CE: attach each (student, subject) cell's CE breakdown so the
    // existing Consolidated/Report Card renderers show CE alongside the
    // written mark — same matrix, no parallel CE-only query path.
    const ceByCell = await loadCeMatrixCells(scoped, examinationId);
    const withCe = rows.map((r) => ({
      ...r,
      ce_components: ceByCell?.components.get(r.exam_subject_id)?.map((c) => {
        const m = ceByCell.marks.get(`${r.student_id}:${c.id}`);
        return { id: c.id, name: c.name, max_marks: c.max_marks, marks_obtained: m?.marks_obtained ?? null, is_absent: m?.is_absent ?? false };
      }) ?? [],
    }));
    // Roster order within each subject block (stable sort keeps subject
    // grouping, then reorders students inside it) -- §users-roles follow-up.
    return sortRoster(withCe.map((r) => ({ ...r, full_name: r.student_name })))
      .sort((a, b) => a.subject_name.localeCompare(b.subject_name));
  });
}

async function loadCeMatrixCells(scoped: DbClient, examinationId: string): Promise<{
  components: Map<string, Array<{ id: string; name: string; max_marks: string }>>;
  marks: Map<string, { marks_obtained: string | null; is_absent: boolean }>;
} | null> {
  const { rows: ex } = await scoped.query<{ ce_enabled: boolean }>("select ce_enabled from examinations where id = $1", [examinationId]);
  if (!ex[0]?.ce_enabled) return null;
  const { rows: comps } = await scoped.query<{ id: string; exam_subject_id: string; name: string; max_marks: string }>(
    `select c.id, c.exam_subject_id, c.name, c.max_marks from exam_ce_components c
       join exam_subjects es on es.id = c.exam_subject_id
      where es.examination_id = $1 order by c.sort_order, c.name`,
    [examinationId]
  );
  const components = new Map<string, Array<{ id: string; name: string; max_marks: string }>>();
  for (const c of comps) {
    const list = components.get(c.exam_subject_id) ?? [];
    list.push({ id: c.id, name: c.name, max_marks: c.max_marks });
    components.set(c.exam_subject_id, list);
  }
  const { rows: cm } = comps.length > 0
    ? await scoped.query<{ student_id: string; ce_component_id: string; marks_obtained: string | null; is_absent: boolean }>(
        "select student_id, ce_component_id, marks_obtained, is_absent from ce_marks where ce_component_id = any($1::uuid[])",
        [comps.map((c) => c.id)]
      )
    : { rows: [] as Array<{ student_id: string; ce_component_id: string; marks_obtained: string | null; is_absent: boolean }> };
  const marks = new Map(cm.map((m) => [`${m.student_id}:${m.ce_component_id}`, { marks_obtained: m.marks_obtained, is_absent: m.is_absent }]));
  return { components, marks };
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
    const { rows } = await scoped.query<ExaminationClassOption & { stage: string | null }>(
      `select distinct c.id, c.name, c.stage
         from exam_classes ec
         join classes c on c.id = ec.class_id
        where ec.examination_id = $1`,
      [examinationId]
    );
    return sortClasses(rows.map((r) => ({ ...r, class_name: r.name })));
  });
}

/** §1.6: a finalized (frozen) result shows the grade label snapshotted at
 *  finalization, immune to later band renames; a live row shows the band's
 *  current label. Expects `results r` and `left join grade_bands gb`. */
const RESULT_GRADE_LABEL_SQL = "case when r.is_frozen then coalesce(r.grade_label, gb.grade_label) else coalesce(gb.grade_label, r.grade_label) end";

/** §CS.4 "don't need compute results -- as mark is started entering, it
 *  should start see in result analysis" -- Result Analysis itself
 *  (modules/analytics/service.ts) shows live/provisional results, but this
 *  is the "official" Results landing page, so it keeps the old finalized-
 *  only behaviour by filtering out is_provisional rows. */
export async function getResults(institutionId: string, authUserId: string, examinationId: string): Promise<ResultRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ResultRow>(
      `select r.student_id, s.full_name as student_name, r.total_marks, r.max_total_marks,
              r.percentage, ${RESULT_GRADE_LABEL_SQL} as grade_label, r.rank,
              r.is_pass, r.failed_subject_count, r.absent_subject_count, r.pass_threshold_pct, r.is_frozen
         from results r
         join students s on s.id = r.student_id
         left join grade_bands gb on gb.id = r.grade_band_id
        where r.examination_id = $1 and r.is_provisional = false
        order by r.percentage desc`,
      [examinationId]
    );
    return rows;
  });
}

export interface StudentResultHistoryRow {
  examination_id: string;
  examination_name: string;
  percentage: string;
  grade_label: string | null;
  computed_at: string;
}

/** Every computed result for one student across ALL examinations, newest
 *  first — the parent/student portal "Results" detail view behind
 *  getStudent360()'s latestResult (portfolio/service.ts), which only ever
 *  returns the single most recent one. Same results/examinations/
 *  grade_bands join, just not narrowed to the latest row. */
export async function listStudentResultHistory(
  institutionId: string, authUserId: string, studentId: string
): Promise<StudentResultHistoryRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StudentResultHistoryRow>(
      `select e.id as examination_id, e.name as examination_name, r.percentage, ${RESULT_GRADE_LABEL_SQL} as grade_label, r.computed_at
         from results r
         join examinations e on e.id = r.examination_id
         left join grade_bands gb on gb.id = r.grade_band_id
        where r.student_id = $1 and r.is_provisional = false
        order by r.computed_at desc`,
      [studentId]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// §491 Print Center follow-up ("Consolidated Mark Sheet ... cumulative") --
// one row per student, one column per examination held in an academic
// year, so an institution can see a student's trajectory across Term 1 /
// Term 2 / Final etc. at a glance instead of opening each exam's own
// Consolidated Marks separately. Built on the same results/grade_bands
// join as getResults()/listStudentResultHistory() above -- one source of
// truth for "this student's computed outcome for this exam" -- just
// pivoted across examinations instead of across students. A student's
// CURRENT class/division (student_enrollments where status = 'active') is
// used for the class filter and roll-number ordering, same convention as
// getExaminationMarksMatrix() above -- a student who has since moved
// class still shows their historical exam scores, just filtered/sorted by
// where they are today.
// ---------------------------------------------------------------------------
export interface CumulativeExamScore {
  examination_id: string;
  examination_name: string;
  percentage: string | null;
  grade_label: string | null;
}
export interface CumulativeMarksheetRow {
  student_id: string; student_name: string; admission_number: string;
  roll_number: number | null; gender: string | null; section_name: string | null; class_name: string | null;
  exams: CumulativeExamScore[];
  /** Simple mean of this student's available per-examination percentages
   *  -- null when the student has no computed result for any examination
   *  in the year yet. Deliberately NOT a re-weighted "grand total" (exams
   *  can have different max marks/subject counts), matching how a plain
   *  cumulative average is described everywhere else the word is used in
   *  this codebase (Daily Assessment's own cumulative_marks_obtained is
   *  the one exception, and that's a same-max-marks running sum, a
   *  different shape of "cumulative" entirely -- see that section's own
   *  doc comment). */
  average_percentage: number | null;
}
export interface CumulativeMarksheetResult {
  /** Column headers, in chronological order (undated examinations last). */
  examinations: Array<{ id: string; name: string }>;
  rows: CumulativeMarksheetRow[];
}

export async function getCumulativeMarksheet(
  institutionId: string, authUserId: string, academicYearId: string, classId?: string | null
): Promise<CumulativeMarksheetResult> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{
      student_id: string; student_name: string; admission_number: string;
      roll_number: number | null; gender: string | null; section_name: string | null; class_name: string | null;
      examination_id: string; examination_name: string; start_date: string | null;
      percentage: string; grade_label: string | null;
    }>(
      `select r.student_id, s.full_name as student_name, s.admission_number,
              se.roll_number, s.gender, sec.name as section_name, c.name as class_name,
              e.id as examination_id, e.name as examination_name, e.start_date,
              r.percentage, ${RESULT_GRADE_LABEL_SQL} as grade_label
         from results r
         join examinations e on e.id = r.examination_id
         join students s on s.id = r.student_id
         left join grade_bands gb on gb.id = r.grade_band_id
         left join student_enrollments se on se.student_id = r.student_id and se.status = 'active'
         left join sections sec on sec.id = se.section_id
         left join classes c on c.id = se.class_id
        where e.academic_year_id = $1 and ($2::uuid is null or se.class_id = $2) and r.is_provisional = false
        order by e.start_date nulls last, e.created_at`,
      [academicYearId, classId || null]
    );

    const examOrder: Array<{ id: string; name: string }> = [];
    const examSeen = new Set<string>();
    const studentMap = new Map<string, CumulativeMarksheetRow>();

    for (const r of rows) {
      if (!examSeen.has(r.examination_id)) {
        examSeen.add(r.examination_id);
        examOrder.push({ id: r.examination_id, name: r.examination_name });
      }
      let student = studentMap.get(r.student_id);
      if (!student) {
        student = {
          student_id: r.student_id, student_name: r.student_name, admission_number: r.admission_number,
          roll_number: r.roll_number, gender: r.gender, section_name: r.section_name, class_name: r.class_name,
          exams: [], average_percentage: null,
        };
        studentMap.set(r.student_id, student);
      }
      student.exams.push({
        examination_id: r.examination_id, examination_name: r.examination_name,
        percentage: r.percentage, grade_label: r.grade_label,
      });
    }

    for (const student of studentMap.values()) {
      const pcts = student.exams.map((e) => Number(e.percentage)).filter((n) => Number.isFinite(n));
      student.average_percentage = pcts.length > 0
        ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100
        : null;
    }

    return {
      examinations: examOrder,
      rows: sortRoster(Array.from(studentMap.values()).map((s) => ({ ...s, full_name: s.student_name }))),
    };
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
  // Education Type follow-up (migration 0041) — which curriculum track
  // this subject belongs to; null unless the institution is in 'both'
  // mode. Lets the Student Portfolio's Academics tab split this report
  // into two sections instead of one flat list.
  track: "academic" | "islamic" | null;
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
              coalesce(m.is_absent, false) as is_absent, sub.track
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

/** "Institution-wide Pass rate trend (across exams in %)" — share of each
 *  examination's students whose STORED overall result is a pass
 *  (results.is_pass, written only by computeResults() via
 *  computeStudentResult()). EXAMINATION_SPEC §1.5: this used to re-derive
 *  "passed" independently (every approved mark >= pass_marks, ignoring the
 *  overall-percentage threshold and absence), so the Home chart could
 *  disagree with Result Analysis / report cards; it now reads the same
 *  stored value getInstitutionPassRateTrendByStage() already used. Only
 *  examinations with at least one computed result are included. Ordered
 *  oldest-to-newest, most recent `limit` examinations. */
export async function getInstitutionPassRateTrend(institutionId: string, authUserId: string, limit = 5): Promise<PassRateTrendPoint[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; name: string; total: string; passed: string }>(
      `select e.id, e.name,
              count(distinct r.student_id) as total,
              count(distinct r.student_id) filter (where r.is_pass) as passed
         from examinations e
         join results r on r.examination_id = e.id
        group by e.id, e.name, e.start_date, e.created_at
       having count(distinct r.student_id) > 0
        order by coalesce(e.start_date, e.created_at::date) desc, e.created_at desc
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

export interface PassRateTrendByStagePoint {
  examinationId: string; examinationName: string; stage: string; percentage: number; totalStudents: number;
}

/** §Dashboard follow-up ("do the same of attendance trend for [pass rate]
 * as well — Y axis 0-100%, X-axis each exams — different section different
 * colour"): the same institution-wide pass-rate trend as
 * getInstitutionPassRateTrend() above, broken out per school STAGE
 * (classes.stage) instead of collapsed into one bar per exam — same
 * "one line per stage" shape as getInstitutionAttendanceTrendByStage() in
 * modules/attendance/service.ts, just X-axis = exam name instead of date.
 * A student's stage is resolved via their ACTIVE enrollment for the exam's
 * own academic year (matches getResultsByStage()'s convention in
 * modules/analytics/service.ts, so a student promoted since the exam still
 * counts under the stage they actually sat it in); classes with no stage
 * set are grouped under 'Unspecified' rather than dropped. Only
 * examinations that already have at least one computed result are
 * included, same as the non-stage version. */
export async function getInstitutionPassRateTrendByStage(institutionId: string, authUserId: string, limit = 5): Promise<PassRateTrendByStagePoint[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: exams } = await scoped.query<{ id: string; name: string }>(
      `select e.id, e.name
         from examinations e
         join results r on r.examination_id = e.id
        group by e.id, e.name, e.start_date, e.created_at
       having count(distinct r.student_id) > 0
        order by coalesce(e.start_date, e.created_at::date) desc, e.created_at desc
        limit $1`,
      [limit]
    );
    if (exams.length === 0) return [];
    const examIds = exams.map((e) => e.id);

    const { rows } = await scoped.query<{ examination_id: string; stage: string; total: string; passed: string }>(
      `select r.examination_id, coalesce(c.stage, 'Unspecified') as stage,
              count(r.id) as total, count(*) filter (where r.is_pass) as passed
         from results r
         join examinations e2 on e2.id = r.examination_id
         join student_enrollments se on se.student_id = r.student_id and se.academic_year_id = e2.academic_year_id and se.status = 'active'
         join classes c on c.id = se.class_id
        where r.examination_id = any($1::uuid[])
        group by r.examination_id, coalesce(c.stage, 'Unspecified')`,
      [examIds]
    );

    const nameById = new Map(exams.map((e) => [e.id, e.name]));
    // Oldest-to-newest (left-to-right on a trend chart), matching
    // getInstitutionPassRateTrend()'s own .reverse() of its DESC query.
    const orderedIds = [...examIds].reverse();
    return orderedIds.flatMap((examId) =>
      rows
        .filter((r) => r.examination_id === examId)
        .map((r) => {
          const total = Number(r.total);
          const passed = Number(r.passed);
          return {
            examinationId: examId,
            examinationName: nameById.get(examId)!,
            stage: r.stage,
            percentage: total > 0 ? Math.round((passed / total) * 10000) / 100 : 0,
            totalStudents: total,
          };
        })
    );
  });
}

// ---------------------------------------------------------------------------
// Daily Assessment (§Daily Assessment — a new Exam Type, migration 0048)
//
// The monthly "register" is just an `examinations` row whose exam_type is
// flagged is_daily_assessment (see createExamination()'s special case
// above) — every function below operates within one such examination_id.
// Each row of `daily_assessments` is one (date, class, subject) session;
// `daily_assessment_marks` holds the per-student marks for that session.
// Nothing here is cached/materialized: the consolidated result, student
// history, and analysis functions all read live off these two tables, so
// "automatically update... as marks are entered" is just what a fresh
// query returns on the next page load, not a separate recompute step.
// ---------------------------------------------------------------------------

export interface DailyAssessmentRow {
  id: string; examination_id: string; class_id: string; class_name: string;
  subject_id: string; subject_name: string; assessment_date: string;
  portion: string; max_marks: string; status: string;
}

const createDailyAssessmentSchema = z.object({
  examinationId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  assessmentDate: z.string().min(1),
  portion: z.string().min(1).max(500),
  maxMarks: z.number().positive().default(20),
});

/** Creates one day's assessment session for a class/subject — "Date,
 *  Class, Subject, Portion, Maximum Mark" from the spec, plus Status
 *  (always 'pending' at creation; enterDailyAssessmentMarks() flips it).
 *  No uniqueness constraint on (class, subject, date): the spec explicitly
 *  calls for "the same subject can be assessed on consecutive days" — nor
 *  does this block a SECOND session for the same subject on the SAME day
 *  (e.g. a make-up session), since nothing in the request forbids that
 *  either. */
export async function createDailyAssessment(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createDailyAssessmentSchema>,
  scopedClient?: DbClient // §Q.1 — lets getOrCreateDailyAssessmentSession() (the "Daily Assessment
                           // Marks" bulk import entity type, modules/bulk/service.ts) commit a whole
                           // batch's session-creates + mark-upserts inside one transaction.
): Promise<DailyAssessmentRow> {
  const data = createDailyAssessmentSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<{ id: string; examination_id: string; class_id: string; subject_id: string; assessment_date: string; portion: string; max_marks: string; status: string }>(
      `insert into daily_assessments (institution_id, examination_id, class_id, subject_id, assessment_date, portion, max_marks, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, examination_id, class_id, subject_id, assessment_date::text, portion, max_marks, status`,
      [institutionId, data.examinationId, data.classId, data.subjectId, data.assessmentDate, data.portion, data.maxMarks, userId]
    );
    const { rows: names } = await scoped.query<{ class_name: string; subject_name: string }>(
      `select (select name from classes where id = $1) as class_name, (select name from subjects where id = $2) as subject_name`,
      [data.classId, data.subjectId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "examination", entityType: "daily_assessments", entityId: rows[0].id, after: rows[0] });
    return { ...rows[0], class_name: names[0]?.class_name ?? "—", subject_name: names[0]?.subject_name ?? "—" };
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

const updateDailyAssessmentSchema = z.object({
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  assessmentDate: z.string().min(1).optional(),
  portion: z.string().min(1).max(500).optional(),
  maxMarks: z.number().positive().optional(),
});

/** §505 "entered daily assessment should be editable and removable" — same
 *  inline-edit shape as updateExamination()/ExaminationsTable above, and
 *  intentionally unrestricted by status: a typo in the portion text (or the
 *  wrong max mark) is just as likely to be noticed AFTER marks have already
 *  been entered for the day as before, and nothing about correcting those
 *  fields invalidates marks already saved against this row (they're keyed
 *  on daily_assessment_id, not on the values being corrected). */
export async function updateDailyAssessment(
  institutionId: string, authUserId: string, userId: string, dailyAssessmentId: string, input: z.infer<typeof updateDailyAssessmentSchema>
): Promise<DailyAssessmentRow> {
  const data = updateDailyAssessmentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ id: string; class_id: string; subject_id: string; assessment_date: string; portion: string; max_marks: string }>(
      "select id, class_id, subject_id, assessment_date::text, portion, max_marks from daily_assessments where id = $1", [dailyAssessmentId]
    );
    if (!before[0]) throw new Error("Daily assessment entry not found.");
    const { rows } = await scoped.query<{ id: string; examination_id: string; class_id: string; subject_id: string; assessment_date: string; portion: string; max_marks: string; status: string }>(
      `update daily_assessments set
         class_id = coalesce($1, class_id),
         subject_id = coalesce($2, subject_id),
         assessment_date = coalesce($3, assessment_date),
         portion = coalesce($4, portion),
         max_marks = coalesce($5, max_marks),
         updated_at = now()
       where id = $6
       returning id, examination_id, class_id, subject_id, assessment_date::text, portion, max_marks, status`,
      [data.classId ?? null, data.subjectId ?? null, data.assessmentDate ?? null, data.portion ?? null, data.maxMarks ?? null, dailyAssessmentId]
    );
    const { rows: names } = await scoped.query<{ class_name: string; subject_name: string }>(
      `select (select name from classes where id = $1) as class_name, (select name from subjects where id = $2) as subject_name`,
      [rows[0].class_id, rows[0].subject_id]
    );
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "examination", entityType: "daily_assessments", entityId: dailyAssessmentId, before: before[0], after: rows[0] });
    return { ...rows[0], class_name: names[0]?.class_name ?? "—", subject_name: names[0]?.subject_name ?? "—" };
  });
}

/** §505 "removable" — a plain delete; ON DELETE CASCADE (migration 0048)
 *  takes any daily_assessment_marks already saved under it with it. Unlike
 *  deleteExamination() (which refuses once real marks exist, because a
 *  whole exam register represents a lot of entered work), one daily
 *  session's marks are cheap to re-enter if this was truly a mistake, and
 *  the explicit ask here is specifically to fix bad rows — including ones
 *  that already have marks against them — not to protect them from that. */
export async function deleteDailyAssessment(institutionId: string, authUserId: string, userId: string, dailyAssessmentId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query("delete from daily_assessments where id = $1 returning id", [dailyAssessmentId]);
    if (rows.length === 0) throw new Error("Daily assessment entry not found.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "daily_assessments", entityId: dailyAssessmentId });
  });
}

export async function listDailyAssessments(
  institutionId: string, authUserId: string, examinationId: string, classId?: string
): Promise<DailyAssessmentRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<DailyAssessmentRow>(
      `select da.id, da.examination_id, da.class_id, c.name as class_name, da.subject_id, sub.name as subject_name,
              da.assessment_date::text, da.portion, da.max_marks, da.status
         from daily_assessments da
         join classes c on c.id = da.class_id
         join subjects sub on sub.id = da.subject_id
        where da.examination_id = $1 ${classId ? "and da.class_id = $2" : ""}
        order by da.assessment_date desc, c.name, sub.name`,
      classId ? [examinationId, classId] : [examinationId]
    );
    return rows;
  });
}

export async function getDailyAssessment(institutionId: string, authUserId: string, id: string): Promise<DailyAssessmentRow | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<DailyAssessmentRow>(
      `select da.id, da.examination_id, da.class_id, c.name as class_name, da.subject_id, sub.name as subject_name,
              da.assessment_date::text, da.portion, da.max_marks, da.status
         from daily_assessments da
         join classes c on c.id = da.class_id
         join subjects sub on sub.id = da.subject_id
        where da.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  });
}

export interface DailyAssessmentMarkRow {
  student_id: string; student_name: string; admission_number: string;
  roll_number: number | null; gender: string | null; section_name: string | null;
  mark_id: string | null; marks_obtained: string | null; is_absent: boolean;
}

/** Roster for one daily assessment session = every actively-enrolled
 *  student in its class, left-joined with any mark already saved for this
 *  session — same shape as the standard exam module's getMarksGrid(). */
export async function getDailyAssessmentMarksGrid(institutionId: string, authUserId: string, dailyAssessmentId: string): Promise<DailyAssessmentMarkRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<DailyAssessmentMarkRow>(
      `select s.id as student_id, s.full_name as student_name, s.admission_number,
              se.roll_number, s.gender, sec.name as section_name,
              dam.id as mark_id, dam.marks_obtained, coalesce(dam.is_absent, false) as is_absent
         from daily_assessments da
         join student_enrollments se on se.class_id = da.class_id and se.status = 'active'
         join students s on s.id = se.student_id
         left join sections sec on sec.id = se.section_id
         left join daily_assessment_marks dam on dam.daily_assessment_id = da.id and dam.student_id = s.id
        where da.id = $1`,
      [dailyAssessmentId]
    );
    return sortRoster(rows.map((r) => ({ ...r, full_name: r.student_name })));
  });
}

const dailyMarkEntrySchema = z.array(
  z.object({
    studentId: z.string().uuid(),
    marksObtained: z.number().nullable(),
    isAbsent: z.boolean().default(false),
  })
);

/** §506 follow-up ("Daily assessment marks shall be entered late also by
 *  choosing date — should be accepted"): this used to throw for any
 *  assessment_date other than current_date, a firm same-day rule from the
 *  original spec. That's been dropped — marks for any Daily Assessment
 *  session, however long ago it was conducted, can now be entered or
 *  re-entered at any time, the same as every other exam type's mark entry
 *  already works. Single-student upsert factored out as
 *  upsertDailyAssessmentMark() below so the bulk import entity type
 *  (§504, modules/bulk/service.ts) can save one row at a time against the
 *  same transaction confirmImport() is already running, without going
 *  through this array-shaped, one-dailyAssessmentId-at-a-time function. */
export async function enterDailyAssessmentMarks(
  institutionId: string, authUserId: string, userId: string, dailyAssessmentId: string, entries: z.infer<typeof dailyMarkEntrySchema>
): Promise<{ updated: number }> {
  const data = dailyMarkEntrySchema.parse(entries);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: daRows } = await scoped.query("select id from daily_assessments where id = $1", [dailyAssessmentId]);
    if (!daRows[0]) throw new Error("Daily assessment entry not found.");

    for (const e of data) {
      await upsertDailyAssessmentMark(institutionId, userId, dailyAssessmentId, e.studentId, e.isAbsent ? null : e.marksObtained, e.isAbsent, scoped);
    }
    await recordAudit(scoped, { institutionId, userId, action: "enter_marks", module: "examination", entityType: "daily_assessments", entityId: dailyAssessmentId, after: { count: data.length } });
    return { updated: data.length };
  });
}

export async function upsertDailyAssessmentMark(
  institutionId: string, userId: string, dailyAssessmentId: string, studentId: string,
  marksObtained: number | null, isAbsent: boolean, scoped: DbClient
): Promise<void> {
  await scoped.query(
    `insert into daily_assessment_marks (institution_id, daily_assessment_id, student_id, marks_obtained, is_absent, entered_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (institution_id, daily_assessment_id, student_id)
     do update set marks_obtained = excluded.marks_obtained, is_absent = excluded.is_absent,
                    entered_by = excluded.entered_by, updated_at = now()`,
    [institutionId, dailyAssessmentId, studentId, isAbsent ? null : marksObtained, isAbsent, userId]
  );
  await scoped.query("update daily_assessments set status = 'completed', updated_at = now() where id = $1", [dailyAssessmentId]);
}

/** §504 "Add mark entry in bulk import/export" for Daily Assessment —
 *  resolves (and creates if needed) the specific session a bulk-imported
 *  mark row belongs to, so the file doesn't have to reference an
 *  examination_id the importer would have no way to know. Finds-or-creates
 *  the monthly register for the ROW'S OWN date (via createExamination's
 *  forDate override above, not current_date) under the institution's one
 *  Daily Assessment exam type, then finds-or-creates the (class, subject,
 *  date) session itself — reusing the earliest-created match if one
 *  already exists (e.g. a prior row in the same file, or a session an
 *  admin already added by hand) rather than creating a duplicate, same
 *  "reuse rather than duplicate" intent as the monthly register lookup
 *  itself. Portion/maxMarks from the row are used only when a NEW session
 *  is created; an existing session's own values are left alone. */
export async function getOrCreateDailyAssessmentSession(
  institutionId: string, authUserId: string, userId: string,
  input: { examTypeId: string; academicYearId: string; classId: string; subjectId: string; assessmentDate: string; portion: string; maxMarks: number },
  scoped: DbClient
): Promise<string> {
  const register = await createExamination(institutionId, authUserId, userId, {
    examTypeId: input.examTypeId, academicYearId: input.academicYearId, name: "Daily Assessment", forDate: input.assessmentDate,
  }, scoped);

  const { rows: existing } = await scoped.query<{ id: string }>(
    `select id from daily_assessments
      where examination_id = $1 and class_id = $2 and subject_id = $3 and assessment_date = $4
      order by created_at asc limit 1`,
    [register.id, input.classId, input.subjectId, input.assessmentDate]
  );
  if (existing[0]) return existing[0].id;

  const created = await createDailyAssessment(institutionId, authUserId, userId, {
    examinationId: register.id, classId: input.classId, subjectId: input.subjectId,
    assessmentDate: input.assessmentDate, portion: input.portion, maxMarks: input.maxMarks,
  }, scoped);
  return created.id;
}

export interface DailyConsolidatedRow {
  student_id: string; student_name: string; admission_number: string;
  roll_number: number | null; gender: string | null; section_name: string | null;
  latest_marks_obtained: string | null; latest_max_marks: string | null; latest_assessment_date: string | null;
  cumulative_marks_obtained: string; cumulative_max_marks: string;
  grade_label: string | null; grade_color: string | null;
}

/** "As each day's marks are entered, automatically update the monthly
 *  consolidated class-wise result" — student name, latest day's mark
 *  ("19/20"), cumulative mark across every completed session this month
 *  ("183/200"), and the grade the cumulative percentage falls into under
 *  the register's own grade scale (falls back to the institution default,
 *  same resolution createExamination()/getStudentExamReport() already
 *  use). Computed fresh on every call — no stored/stale column. */
export async function getDailyAssessmentConsolidatedResult(
  institutionId: string, authUserId: string, examinationId: string, classId: string, subjectId?: string
): Promise<DailyConsolidatedRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: examRows } = await scoped.query<{ grade_scale_id: string | null }>(
      "select grade_scale_id from examinations where id = $1", [examinationId]
    );
    let gradeScaleId = examRows[0]?.grade_scale_id ?? null;
    if (!gradeScaleId) {
      const { rows: def } = await scoped.query<{ id: string }>("select id from grade_scales where is_default = true limit 1");
      gradeScaleId = def[0]?.id ?? null;
    }

    const subjectFilter = subjectId ? "and da.subject_id = $3" : "";
    const params = subjectId ? [examinationId, classId, subjectId] : [examinationId, classId];

    const { rows: rawTotals } = await scoped.query<{ student_id: string; student_name: string; admission_number: string; roll_number: number | null; gender: string | null; section_name: string | null; cumulative_marks_obtained: string; cumulative_max_marks: string }>(
      `select s.id as student_id, s.full_name as student_name, s.admission_number, se.roll_number, s.gender, sec.name as section_name,
              coalesce(sum(dam.marks_obtained) filter (where dam.id is not null and not dam.is_absent), 0)::text as cumulative_marks_obtained,
              coalesce(sum(da.max_marks) filter (where dam.id is not null and not dam.is_absent), 0)::text as cumulative_max_marks
         from daily_assessments da
         join student_enrollments se on se.class_id = da.class_id and se.status = 'active'
         join students s on s.id = se.student_id
         left join sections sec on sec.id = se.section_id
         left join daily_assessment_marks dam on dam.daily_assessment_id = da.id and dam.student_id = s.id
        where da.examination_id = $1 and da.class_id = $2 and da.status = 'completed' ${subjectFilter}
        group by s.id, s.full_name, s.admission_number, se.roll_number, s.gender, sec.name`,
      params
    );
    const totals = sortRoster(rawTotals.map((r) => ({ ...r, full_name: r.student_name })));

    const { rows: latest } = await scoped.query<{ student_id: string; marks_obtained: string | null; max_marks: string; assessment_date: string }>(
      `select distinct on (s.id) s.id as student_id, dam.marks_obtained, da.max_marks, da.assessment_date::text
         from daily_assessments da
         join student_enrollments se on se.class_id = da.class_id and se.status = 'active'
         join students s on s.id = se.student_id
         join daily_assessment_marks dam on dam.daily_assessment_id = da.id and dam.student_id = s.id
        where da.examination_id = $1 and da.class_id = $2 and da.status = 'completed' ${subjectFilter}
        order by s.id, da.assessment_date desc, da.created_at desc`,
      params
    );
    const latestByStudent = new Map(latest.map((r) => [r.student_id, r]));

    const out: DailyConsolidatedRow[] = [];
    for (const r of totals) {
      const maxTotal = Number(r.cumulative_max_marks);
      const pct = maxTotal > 0 ? (Number(r.cumulative_marks_obtained) / maxTotal) * 100 : 0;
      const grade = maxTotal > 0 ? await lookupGrade(scoped, gradeScaleId, pct) : null;
      const l = latestByStudent.get(r.student_id);
      out.push({
        student_id: r.student_id, student_name: r.student_name, admission_number: r.admission_number,
        roll_number: r.roll_number, gender: r.gender, section_name: r.section_name,
        latest_marks_obtained: l?.marks_obtained ?? null, latest_max_marks: l?.max_marks ?? null, latest_assessment_date: l?.assessment_date ?? null,
        cumulative_marks_obtained: r.cumulative_marks_obtained, cumulative_max_marks: r.cumulative_max_marks,
        grade_label: grade?.label ?? null, grade_color: grade?.color ?? null,
      });
    }
    return out;
  });
}

export interface StudentDailyAssessmentRow {
  assessment_date: string; subject_name: string; portion: string;
  marks_obtained: string | null; max_marks: string; is_absent: boolean;
}

/** Student Profile "daily performance" — Date, Subject, Portion, Marks for
 *  every completed session this student has a mark row for, across every
 *  Daily Assessment register (not just the current month), most recent
 *  first. */
export async function getStudentDailyAssessmentHistory(institutionId: string, authUserId: string, studentId: string): Promise<StudentDailyAssessmentRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StudentDailyAssessmentRow>(
      `select da.assessment_date::text, sub.name as subject_name, da.portion, dam.marks_obtained, da.max_marks, dam.is_absent
         from daily_assessment_marks dam
         join daily_assessments da on da.id = dam.daily_assessment_id
         join subjects sub on sub.id = da.subject_id
        where dam.student_id = $1
        order by da.assessment_date desc, da.created_at desc`,
      [studentId]
    );
    return rows;
  });
}

export interface DailyAssessmentSubjectAnalysisRow {
  subject_id: string; subject_name: string; sessions_conducted: number; portions: string[]; avg_percent: number;
}

/** Monthly subject-wise analysis — how many sessions this register ran for
 *  each subject, which portions were covered (verbatim, in the order
 *  conducted), and the class average percentage across all of them. */
export async function getDailyAssessmentSubjectAnalysis(
  institutionId: string, authUserId: string, examinationId: string, classId?: string
): Promise<DailyAssessmentSubjectAnalysisRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ subject_id: string; subject_name: string; sessions_conducted: string; portions: string[]; avg_percent: string | null }>(
      `select sub.id as subject_id, sub.name as subject_name,
              count(distinct da.id)::text as sessions_conducted,
              array_agg(distinct da.portion order by da.portion) filter (where da.portion is not null) as portions,
              avg(case when dam.id is not null and not dam.is_absent and da.max_marks > 0 then dam.marks_obtained / da.max_marks * 100 end) as avg_percent
         from daily_assessments da
         join subjects sub on sub.id = da.subject_id
         left join daily_assessment_marks dam on dam.daily_assessment_id = da.id
        where da.examination_id = $1 and da.status = 'completed' ${classId ? "and da.class_id = $2" : ""}
        group by sub.id, sub.name
        order by sub.name`,
      classId ? [examinationId, classId] : [examinationId]
    );
    return rows.map((r) => ({
      subject_id: r.subject_id, subject_name: r.subject_name,
      sessions_conducted: Number(r.sessions_conducted), portions: r.portions ?? [],
      avg_percent: r.avg_percent !== null ? Math.round(Number(r.avg_percent) * 10) / 10 : 0,
    }));
  });
}

export interface DailyAssessmentClassAnalysisRow {
  class_id: string; class_name: string; sessions_conducted: number; avg_percent: number;
}

/** Monthly class-wise analysis — sessions conducted and average
 *  performance for every class this register has entries for. */
export async function getDailyAssessmentClassAnalysis(institutionId: string, authUserId: string, examinationId: string): Promise<DailyAssessmentClassAnalysisRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ class_id: string; class_name: string; stage: string | null; sessions_conducted: string; avg_percent: string | null }>(
      `select c.id as class_id, c.name as class_name, c.stage,
              count(distinct da.id)::text as sessions_conducted,
              avg(case when dam.id is not null and not dam.is_absent and da.max_marks > 0 then dam.marks_obtained / da.max_marks * 100 end) as avg_percent
         from daily_assessments da
         join classes c on c.id = da.class_id
         left join daily_assessment_marks dam on dam.daily_assessment_id = da.id
        where da.examination_id = $1 and da.status = 'completed'
        group by c.id, c.name, c.stage`,
      [examinationId]
    );
    return sortClasses(rows).map((r) => ({
      class_id: r.class_id, class_name: r.class_name, sessions_conducted: Number(r.sessions_conducted),
      avg_percent: r.avg_percent !== null ? Math.round(Number(r.avg_percent) * 10) / 10 : 0,
    }));
  });
}

export interface DailyAssessmentStudentAnalysisRow {
  student_id: string; student_name: string; admission_number: string;
  roll_number: number | null; gender: string | null; section_name: string | null;
  sessions_taken: number; cumulative_marks_obtained: string; cumulative_max_marks: string; avg_percent: number;
}

/** Monthly student-wise analysis for one class — every session taken,
 *  cumulative marks, and average percentage across all subjects (not
 *  filtered to one), for whichever class is selected. */
export async function getDailyAssessmentStudentAnalysis(
  institutionId: string, authUserId: string, examinationId: string, classId: string
): Promise<DailyAssessmentStudentAnalysisRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: rawRows } = await scoped.query<{ student_id: string; student_name: string; admission_number: string; roll_number: number | null; gender: string | null; section_name: string | null; sessions_taken: string; cumulative_marks_obtained: string; cumulative_max_marks: string }>(
      `select s.id as student_id, s.full_name as student_name, s.admission_number, se.roll_number, s.gender, sec.name as section_name,
              count(dam.id) filter (where dam.id is not null and not dam.is_absent)::text as sessions_taken,
              coalesce(sum(dam.marks_obtained) filter (where dam.id is not null and not dam.is_absent), 0)::text as cumulative_marks_obtained,
              coalesce(sum(da.max_marks) filter (where dam.id is not null and not dam.is_absent), 0)::text as cumulative_max_marks
         from daily_assessments da
         join student_enrollments se on se.class_id = da.class_id and se.status = 'active'
         join students s on s.id = se.student_id
         left join sections sec on sec.id = se.section_id
         left join daily_assessment_marks dam on dam.daily_assessment_id = da.id and dam.student_id = s.id
        where da.examination_id = $1 and da.class_id = $2 and da.status = 'completed'
        group by s.id, s.full_name, s.admission_number, se.roll_number, s.gender, sec.name`,
      [examinationId, classId]
    );
    const rows = sortRoster(rawRows.map((r) => ({ ...r, full_name: r.student_name })));
    return rows.map((r) => {
      const maxTotal = Number(r.cumulative_max_marks);
      return {
        student_id: r.student_id, student_name: r.student_name, admission_number: r.admission_number,
        roll_number: r.roll_number, gender: r.gender, section_name: r.section_name,
        sessions_taken: Number(r.sessions_taken),
        cumulative_marks_obtained: r.cumulative_marks_obtained, cumulative_max_marks: r.cumulative_max_marks,
        avg_percent: maxTotal > 0 ? Math.round((Number(r.cumulative_marks_obtained) / maxTotal) * 1000) / 10 : 0,
      };
    });
  });
}
