/**
 * PROMPT EDU ERP — Analytics module service.
 * ARCHITECTURE.md §N (Analytics Architecture), Phase 5 (§AA.2).
 *
 * Layering per §N.1: raw module data -> materialized views (aggregation
 * layer, see database/migrations/0007_analytics.sql) -> this service
 * (typed query functions) -> UI.
 *
 * RLS NOTE (see the migration file for the full explanation): the two
 * materialized views this service reads from have NO row-level security —
 * Postgres does not support RLS on matviews. Every exported function here
 * takes an explicit institutionId and hard-filters every query on it. This
 * file is the ONLY sanctioned way to read mv_exam_subject_stats /
 * mv_attendance_monthly — never query them directly from anywhere else.
 *
 * classification_rules is institution CONFIGURATION (§N.4/§30) — no
 * threshold is ever a literal in this file; every call looks the
 * institution's rule up from the database.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";

export interface SubjectStatRow {
  subject_id: string; subject_name: string; class_id: string; section_id: string | null;
  marked_count: number; avg_marks: number | null; pass_count: number; pass_percentage: number | null; spread: number | null;
}
export interface AttendanceTrendRow {
  month: string; present_days: number; late_days: number; total_days: number; present_percent: number;
}
export interface ClassificationRuleRecord {
  id: string; based_on: string; high_threshold: number; low_threshold: number;
}
export type AchieverBand = "high_achiever" | "middle_achiever" | "low_achiever";

/** Refreshes both materialized views. Non-concurrent (no unique index / job
 *  runner exist yet at this phase — see the migration file) so this briefly
 *  locks readers; acceptable at this phase's scale. Institution-agnostic —
 *  the views span every institution, so this is a whole-database maintenance
 *  action, not a per-tenant one. */
export async function refreshAnalyticsViews(): Promise<void> {
  const db = await getDbClient();
  await db.execRaw("select refresh_analytics_views();");
}

// ---------------------------------------------------------------------------
// Examination analytics (§N.3 mv_exam_subject_stats)
// ---------------------------------------------------------------------------
export async function getExamSubjectStats(
  institutionId: string, authUserId: string, examinationId: string
): Promise<SubjectStatRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SubjectStatRow>(
      `select v.subject_id, sub.name as subject_name, v.class_id, v.section_id,
              coalesce(v.marked_count, 0) as marked_count,
              v.avg_marks,
              coalesce(v.pass_count, 0) as pass_count,
              case when coalesce(v.marked_count, 0) > 0
                   then round((v.pass_count::numeric / v.marked_count) * 100, 2)
                   else null end as pass_percentage,
              v.spread
         from mv_exam_subject_stats v
         join subjects sub on sub.id = v.subject_id
        where v.institution_id = $1 and v.examination_id = $2
        order by sub.name`,
      [institutionId, examinationId]
    );
    return rows;
  });
}

/** Subject comparison across an examination — the same rows as
 *  getExamSubjectStats(), aggregated across sections per subject (§N.1
 *  getSubjectComparison()). */
export async function getSubjectComparison(
  institutionId: string, authUserId: string, examinationId: string
): Promise<SubjectStatRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SubjectStatRow>(
      `select v.subject_id, sub.name as subject_name, null::uuid as class_id, null::uuid as section_id,
              sum(coalesce(v.marked_count, 0))::int as marked_count,
              case when sum(coalesce(v.marked_count, 0)) > 0
                   then round(sum(v.avg_marks * v.marked_count) / sum(v.marked_count), 2)
                   else null end as avg_marks,
              sum(coalesce(v.pass_count, 0))::int as pass_count,
              case when sum(coalesce(v.marked_count, 0)) > 0
                   then round((sum(coalesce(v.pass_count, 0))::numeric / sum(v.marked_count)) * 100, 2)
                   else null end as pass_percentage,
              null::numeric as spread
         from mv_exam_subject_stats v
         join subjects sub on sub.id = v.subject_id
        where v.institution_id = $1 and v.examination_id = $2
        group by v.subject_id, sub.name
        order by sub.name`,
      [institutionId, examinationId]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Attendance analytics (§N.3 mv_attendance_monthly)
// ---------------------------------------------------------------------------
export async function getStudentAttendanceTrend(
  institutionId: string, authUserId: string, studentId: string, fromMonth: string, toMonth: string
): Promise<AttendanceTrendRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ month: string; present_days: string; late_days: string; total_days: string }>(
      `select month::text as month, present_days, late_days, total_days
         from mv_attendance_monthly
        where institution_id = $1 and student_id = $2 and month between $3::date and $4::date
        order by month`,
      [institutionId, studentId, `${fromMonth}-01`, `${toMonth}-01`]
    );
    return rows.map((r) => {
      const total = Number(r.total_days);
      const present = Number(r.present_days);
      return {
        month: r.month,
        present_days: present,
        late_days: Number(r.late_days),
        total_days: total,
        present_percent: total > 0 ? Math.round((present / total) * 10000) / 100 : 0,
      };
    });
  });
}

export async function getClassAttendanceTrend(
  institutionId: string, authUserId: string, classId: string, sectionId: string, fromMonth: string, toMonth: string
): Promise<AttendanceTrendRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ month: string; present_days: string; late_days: string; total_days: string }>(
      `select month::text as month, sum(present_days) as present_days, sum(late_days) as late_days, sum(total_days) as total_days
         from mv_attendance_monthly
        where institution_id = $1 and class_id = $2 and section_id = $3 and month between $4::date and $5::date
        group by month
        order by month`,
      [institutionId, classId, sectionId, `${fromMonth}-01`, `${toMonth}-01`]
    );
    return rows.map((r) => {
      const total = Number(r.total_days);
      const present = Number(r.present_days);
      return {
        month: r.month,
        present_days: present,
        late_days: Number(r.late_days),
        total_days: total,
        present_percent: total > 0 ? Math.round((present / total) * 10000) / 100 : 0,
      };
    });
  });
}

// ---------------------------------------------------------------------------
// High/Middle/Low achiever classification (§N.4, §30)
// ---------------------------------------------------------------------------
export async function getClassificationRule(
  institutionId: string, authUserId: string, basedOn = "percentage"
): Promise<ClassificationRuleRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; based_on: string; high_threshold: string; low_threshold: string }>(
      "select id, based_on, high_threshold, low_threshold from classification_rules where based_on = $1",
      [basedOn]
    );
    if (rows.length === 0) return null;
    return { id: rows[0].id, based_on: rows[0].based_on, high_threshold: Number(rows[0].high_threshold), low_threshold: Number(rows[0].low_threshold) };
  });
}

const setClassificationRuleSchema = z.object({
  basedOn: z.enum(["percentage", "average", "grade", "consolidated_score"]),
  highThreshold: z.number(),
  lowThreshold: z.number(),
});

export async function upsertClassificationRule(
  institutionId: string, authUserId: string, input: z.infer<typeof setClassificationRuleSchema>
): Promise<ClassificationRuleRecord> {
  const data = setClassificationRuleSchema.parse(input);
  if (data.highThreshold < data.lowThreshold) throw new Error("High threshold must be >= low threshold.");
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; based_on: string; high_threshold: string; low_threshold: string }>(
      `insert into classification_rules (institution_id, based_on, high_threshold, low_threshold)
       values ($1, $2, $3, $4)
       on conflict (institution_id, based_on)
       do update set high_threshold = excluded.high_threshold, low_threshold = excluded.low_threshold
       returning id, based_on, high_threshold, low_threshold`,
      [institutionId, data.basedOn, data.highThreshold, data.lowThreshold]
    );
    return { id: rows[0].id, based_on: rows[0].based_on, high_threshold: Number(rows[0].high_threshold), low_threshold: Number(rows[0].low_threshold) };
  });
}

/** Classifies a student's result for one examination against the
 *  institution's 'percentage' classification rule (§N.4). Falls back to
 *  "middle_achiever" if no rule is configured, rather than guessing a
 *  threshold. */
export async function classifyStudentResult(
  institutionId: string, authUserId: string, studentId: string, examinationId: string
): Promise<{ band: AchieverBand | null; percentage: number | null }> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ percentage: string }>(
      "select percentage from results where student_id = $1 and examination_id = $2",
      [studentId, examinationId]
    );
    if (rows.length === 0) return { band: null, percentage: null };
    const percentage = Number(rows[0].percentage);

    const { rows: ruleRows } = await scoped.query<{ high_threshold: string; low_threshold: string }>(
      "select high_threshold, low_threshold from classification_rules where based_on = 'percentage'"
    );
    if (ruleRows.length === 0) return { band: "middle_achiever", percentage };

    const high = Number(ruleRows[0].high_threshold);
    const low = Number(ruleRows[0].low_threshold);
    const band: AchieverBand = percentage >= high ? "high_achiever" : percentage < low ? "low_achiever" : "middle_achiever";
    return { band, percentage };
  });
}

export interface StudentClassificationRow {
  student_id: string; student_name: string; percentage: number; band: AchieverBand;
}

/** Bulk version of classifyStudentResult() for an entire examination — one
 *  query instead of one-per-student (§N.4). Falls back to "middle_achiever"
 *  for every student if no 'percentage' rule is configured yet. */
export async function getExaminationClassification(
  institutionId: string, authUserId: string, examinationId: string
): Promise<StudentClassificationRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: ruleRows } = await scoped.query<{ high_threshold: string; low_threshold: string }>(
      "select high_threshold, low_threshold from classification_rules where based_on = 'percentage'"
    );
    const high = ruleRows[0] ? Number(ruleRows[0].high_threshold) : null;
    const low = ruleRows[0] ? Number(ruleRows[0].low_threshold) : null;

    const { rows } = await scoped.query<{ student_id: string; student_name: string; percentage: string }>(
      `select r.student_id, s.full_name as student_name, r.percentage
         from results r
         join students s on s.id = r.student_id
        where r.examination_id = $1
        order by r.percentage desc`,
      [examinationId]
    );
    return rows.map((r) => {
      const percentage = Number(r.percentage);
      const band: AchieverBand =
        high === null || low === null ? "middle_achiever"
        : percentage >= high ? "high_achiever"
        : percentage < low ? "low_achiever"
        : "middle_achiever";
      return { student_id: r.student_id, student_name: r.student_name, percentage, band };
    });
  });
}

// ---------------------------------------------------------------------------
// Teacher-associated indicators — neutral framing (§N.5, §29/§62)
// ---------------------------------------------------------------------------
export interface SubjectPerformanceIndicator {
  subject_id: string; subject_name: string; class_id: string; section_id: string | null;
  average_performance: number | null; pass_percentage: number | null; disclaimer_key: string;
}

/**
 * Returns class/subject-level performance indicators framed as neutral
 * signals (§N.5 "never a scored verdict"), NOT attributed to an individual
 * teacher — this platform does not yet have a subject-teacher assignment
 * table (that lands with the staff module, Phase 10 per §AA.2), so per-
 * teacher attribution is intentionally deferred rather than guessed at. Once
 * that mapping exists, wiring a teacher_id filter onto this same shape is a
 * small addition, not a redesign — the disclaimer_key/neutral-shape contract
 * from §N.5 is already in place.
 */
export async function getSubjectPerformanceIndicators(
  institutionId: string, authUserId: string, examinationId: string
): Promise<SubjectPerformanceIndicator[]> {
  const stats = await getExamSubjectStats(institutionId, authUserId, examinationId);
  return stats.map((s) => ({
    subject_id: s.subject_id,
    subject_name: s.subject_name,
    class_id: s.class_id,
    section_id: s.section_id,
    average_performance: s.avg_marks,
    pass_percentage: s.pass_percentage,
    disclaimer_key: "performance_indicator_requires_management_interpretation",
  }));
}
