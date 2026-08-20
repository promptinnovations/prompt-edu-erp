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
import type { AttendanceScope } from "../attendance/service";

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

/** §Attendance-follow-up-3 "can be a curve last 30 days, monthly also
 *  should be available" — the institution-wide (or role-scoped, same
 *  AttendanceScope shape getInstitutionAttendanceTrend() and
 *  getDailyAttendanceOverview() use) MONTHLY companion to that function's
 *  daily curve. Reads mv_attendance_monthly (§N.3, periodically refreshed —
 *  "Refresh analytics" applies here, unlike the always-live daily curve
 *  which reads attendance_records directly) rather than re-aggregating raw
 *  attendance_records across a potentially long date range on every page
 *  load. */
export async function getInstitutionAttendanceTrendMonthly(
  institutionId: string, authUserId: string, fromMonth: string, toMonth: string, scope?: AttendanceScope
): Promise<AttendanceTrendRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ month: string; present_days: string; late_days: string; total_days: string }>(
      `select m.month::text as month, sum(m.present_days) as present_days, sum(m.late_days) as late_days, sum(m.total_days) as total_days
         from mv_attendance_monthly m
         left join classes c on c.id = m.class_id
        where m.institution_id = $1 and m.month between $2::date and $3::date
          and ($4::uuid[] is null or m.class_id = any($4))
          and ($5::text[] is null or c.stage = any($5))
        group by m.month
        order by m.month`,
      [institutionId, `${fromMonth}-01`, `${toMonth}-01`, scope?.classIds ?? null, scope?.stages ?? null]
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

// ---------------------------------------------------------------------------
// Result Analysis (§Page-6 follow-up: "Result Analysis (of selected exam) —
// School-wide, Section wise, Grade wise, Class wise, Subject wise, Teacher
// wise"). School/section/class/grade-wise below all read `results`
// directly (computeResults() writes it synchronously, so these are always
// live — no "Refresh analytics" needed). Subject-wise/teacher-wise reuse
// the existing mv_exam_subject_stats rollup (same staleness/refresh
// contract as the pre-existing Subject Comparison table above). Every
// breakdown is ranked purely by sort order in the returned array (average
// % descending) — no "best/worst" label is attached server-side, keeping
// §N.5's "neutral signal, requires management interpretation" framing; the
// UI attaches a plain rank number.
// ---------------------------------------------------------------------------
export interface GradeDistributionRow {
  grade_band_id: string; grade_label: string; min_percent: number; max_percent: number; student_count: number;
}

export interface ResultSchoolSummary {
  total_students: number; average_percent: number | null; grade_distribution: GradeDistributionRow[];
}

async function getGradeDistribution(
  institutionId: string, authUserId: string, examinationId: string
): Promise<GradeDistributionRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ grade_band_id: string; grade_label: string; min_percent: string; max_percent: string; student_count: string }>(
      `select gb.id as grade_band_id, gb.grade_label, gb.min_percent, gb.max_percent,
              count(r.id)::int as student_count
         from examinations e
         join grade_bands gb on gb.grade_scale_id = e.grade_scale_id
         left join results r on r.grade_band_id = gb.id and r.examination_id = e.id
        where e.id = $1
        group by gb.id, gb.grade_label, gb.min_percent, gb.max_percent
        order by gb.min_percent desc`,
      [examinationId]
    );
    return rows.map((r) => ({
      grade_band_id: r.grade_band_id, grade_label: r.grade_label,
      min_percent: Number(r.min_percent), max_percent: Number(r.max_percent),
      student_count: Number(r.student_count),
    }));
  });
}

/** School-wide summary — every student with a computed result for this
 *  examination, regardless of class/section. */
export async function getResultSchoolSummary(
  institutionId: string, authUserId: string, examinationId: string
): Promise<ResultSchoolSummary> {
  const db = await getDbClient();
  const [summary, gradeDistribution] = await Promise.all([
    db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const { rows } = await scoped.query<{ total_students: string; average_percent: string | null }>(
        `select count(*)::int as total_students, round(avg(percentage), 2) as average_percent
           from results where examination_id = $1`,
        [examinationId]
      );
      return rows[0];
    }),
    getGradeDistribution(institutionId, authUserId, examinationId),
  ]);
  return {
    total_students: Number(summary?.total_students ?? 0),
    average_percent: summary?.average_percent !== null && summary?.average_percent !== undefined ? Number(summary.average_percent) : null,
    grade_distribution: gradeDistribution,
  };
}

export interface ResultGroupRow {
  id: string; name: string; parent_name: string | null;
  student_count: number; average_percent: number | null; grade_counts: Record<string, number>;
}

/** Shared shape for both section-wise and class-wise breakdowns — each
 *  student's class/section is resolved via their ACTIVE enrollment for the
 *  exam's own academic year (not their current-today enrollment), since a
 *  student promoted since this exam took place must still be attributed to
 *  the class/section they were actually in when they sat it. Every
 *  academic year's enrollment row is kept as permanent history (§Page-2/3
 *  follow-up's promoteClass() never deletes/rewrites a past year's row),
 *  so this join is safe and stable no matter how many promotions happened
 *  after the fact. */
async function getResultGroups(
  institutionId: string, authUserId: string, examinationId: string, groupBy: "section" | "class"
): Promise<ResultGroupRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const groupCols = groupBy === "section"
      ? "se.section_id as id, sec.name as name, c.name as parent_name"
      : "c.id as id, c.name as name, null::text as parent_name";
    // c.sort_order drives ordering only (the final array is re-sorted by
    // average % below anyway) — included via max() so it can appear in
    // ORDER BY without needing to widen the GROUP BY key.
    const groupByCols = groupBy === "section" ? "se.section_id, sec.name, c.name" : "c.id, c.name";

    const { rows: base } = await scoped.query<{ id: string; name: string; parent_name: string | null; student_count: string; average_percent: string | null }>(
      `select ${groupCols},
              count(r.id)::int as student_count, round(avg(r.percentage), 2) as average_percent
         from results r
         join examinations e on e.id = r.examination_id
         join student_enrollments se on se.student_id = r.student_id and se.academic_year_id = e.academic_year_id and se.status = 'active'
         join sections sec on sec.id = se.section_id
         join classes c on c.id = se.class_id
        where r.examination_id = $1
        group by ${groupByCols}
        order by max(c.sort_order), name`,
      [examinationId]
    );

    const gradeGroupCol = groupBy === "section" ? "se.section_id" : "c.id";
    const { rows: gradeRows } = await scoped.query<{ group_id: string; grade_label: string; student_count: string }>(
      `select ${gradeGroupCol} as group_id, gb.grade_label, count(r.id)::int as student_count
         from results r
         join examinations e on e.id = r.examination_id
         join student_enrollments se on se.student_id = r.student_id and se.academic_year_id = e.academic_year_id and se.status = 'active'
         join classes c on c.id = se.class_id
         left join grade_bands gb on gb.id = r.grade_band_id
        where r.examination_id = $1 and r.grade_band_id is not null
        group by ${gradeGroupCol}, gb.grade_label`,
      [examinationId]
    );
    const gradesByGroup = new Map<string, Record<string, number>>();
    for (const g of gradeRows) {
      if (!gradesByGroup.has(g.group_id)) gradesByGroup.set(g.group_id, {});
      gradesByGroup.get(g.group_id)![g.grade_label] = Number(g.student_count);
    }

    return base
      .map((r) => ({
        id: r.id, name: r.name, parent_name: r.parent_name,
        student_count: Number(r.student_count),
        average_percent: r.average_percent !== null ? Number(r.average_percent) : null,
        grade_counts: gradesByGroup.get(r.id) ?? {},
      }))
      .sort((a, b) => (b.average_percent ?? -1) - (a.average_percent ?? -1));
  });
}

export async function getResultsBySection(institutionId: string, authUserId: string, examinationId: string): Promise<ResultGroupRow[]> {
  return getResultGroups(institutionId, authUserId, examinationId, "section");
}

export async function getResultsByClass(institutionId: string, authUserId: string, examinationId: string): Promise<ResultGroupRow[]> {
  return getResultGroups(institutionId, authUserId, examinationId, "class");
}

export interface GradeTopStudentRow { student_id: string; student_name: string; percentage: number }
export interface GradeWiseGroup {
  grade_band_id: string; grade_label: string; min_percent: number; max_percent: number;
  student_count: number; top_students: GradeTopStudentRow[];
}

/** "Grade wise" analysis — the letter-grade distribution (reusing
 *  getGradeDistribution()) plus, per the user's own spec ("Top 5 each
 *  grade"), the top 5 students within each band by percentage. Empty
 *  (rather than throwing) when the examination has no grade_scale_id
 *  configured, matching this codebase's existing "no rule configured"
 *  convention elsewhere. */
export async function getResultsByGrade(
  institutionId: string, authUserId: string, examinationId: string
): Promise<GradeWiseGroup[]> {
  const db = await getDbClient();
  const [distribution, topRows] = await Promise.all([
    getGradeDistribution(institutionId, authUserId, examinationId),
    db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const { rows } = await scoped.query<{ grade_band_id: string; student_id: string; student_name: string; percentage: string }>(
        `select grade_band_id, student_id, student_name, percentage from (
           select gb.id as grade_band_id, r.student_id, s.full_name as student_name, r.percentage,
                  row_number() over (partition by gb.id order by r.percentage desc) as rn
             from results r
             join grade_bands gb on gb.id = r.grade_band_id
             join students s on s.id = r.student_id
            where r.examination_id = $1
         ) ranked
         where rn <= 5
         order by percentage desc`,
        [examinationId]
      );
      return rows;
    }),
  ]);

  const topByBand = new Map<string, GradeTopStudentRow[]>();
  for (const r of topRows) {
    if (!topByBand.has(r.grade_band_id)) topByBand.set(r.grade_band_id, []);
    topByBand.get(r.grade_band_id)!.push({ student_id: r.student_id, student_name: r.student_name, percentage: Number(r.percentage) });
  }

  return distribution.map((d) => ({
    ...d,
    top_students: topByBand.get(d.grade_band_id) ?? [],
  }));
}

export interface TeacherResultRow {
  teacher_user_id: string; teacher_name: string; subject_id: string; subject_name: string;
  marked_count: number; average_marks: number | null; pass_percentage: number | null;
}

/** "Teacher wise" analysis — attributes each mv_exam_subject_stats row to
 *  whichever teacher_assignments row covers that (subject, class, section)
 *  for the exam's own academic year, via role_type = 'subject_teacher' (the
 *  same mapping Staff > Teacher Assignments already collects — no new data
 *  entry, per the user's own choice). A teacher teaching the same subject
 *  across multiple classes/sections gets ONE aggregated row (weighted
 *  average, same aggregation shape as getSubjectComparison() above) rather
 *  than one row per section. Institutions that haven't set up teacher
 *  assignments simply get an empty list here — not an error. */
export async function getResultsByTeacher(
  institutionId: string, authUserId: string, examinationId: string
): Promise<TeacherResultRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: examRow } = await scoped.query<{ academic_year_id: string }>(
      "select academic_year_id from examinations where id = $1", [examinationId]
    );
    if (examRow.length === 0) return [];
    const academicYearId = examRow[0].academic_year_id;

    const { rows } = await scoped.query<{
      teacher_user_id: string; teacher_name: string; subject_id: string; subject_name: string;
      marked_count: string; average_marks: string | null; pass_percentage: string | null;
    }>(
      `select ta.user_id as teacher_user_id, u.full_name as teacher_name,
              v.subject_id, sub.name as subject_name,
              sum(coalesce(v.marked_count, 0))::int as marked_count,
              case when sum(coalesce(v.marked_count, 0)) > 0
                   then round(sum(v.avg_marks * v.marked_count) / sum(v.marked_count), 2)
                   else null end as average_marks,
              case when sum(coalesce(v.marked_count, 0)) > 0
                   then round((sum(coalesce(v.pass_count, 0))::numeric / sum(v.marked_count)) * 100, 2)
                   else null end as pass_percentage
         from mv_exam_subject_stats v
         join subjects sub on sub.id = v.subject_id
         join teacher_assignments ta on ta.subject_id = v.subject_id and ta.class_id = v.class_id
              and (ta.section_id is null or ta.section_id = v.section_id)
              and ta.role_type = 'subject_teacher' and ta.academic_year_id = $3
         join users u on u.id = ta.user_id
        where v.institution_id = $1 and v.examination_id = $2
        group by ta.user_id, u.full_name, v.subject_id, sub.name
        order by u.full_name, sub.name`,
      [institutionId, examinationId, academicYearId]
    );
    return rows
      .map((r) => ({
        teacher_user_id: r.teacher_user_id, teacher_name: r.teacher_name,
        subject_id: r.subject_id, subject_name: r.subject_name,
        marked_count: Number(r.marked_count),
        average_marks: r.average_marks !== null ? Number(r.average_marks) : null,
        pass_percentage: r.pass_percentage !== null ? Number(r.pass_percentage) : null,
      }))
      .sort((a, b) => (b.average_marks ?? -1) - (a.average_marks ?? -1));
  });
}
