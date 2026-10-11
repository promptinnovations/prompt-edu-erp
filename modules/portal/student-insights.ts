/**
 * PROMPT EDU ERP — student portal insights (§Student-portal-visual-redesign).
 *
 * "Each item in the side panel should show data with suitable visual
 * representations — avoid repetition of the same data in multiple areas."
 * One loader per portal page, each returning exactly the data that page
 * visualises and nothing it shares with another page:
 *
 *   Dashboard    getDashboardInsights()     headline numbers, what's next,
 *                                           to-dos, kudos
 *   Academics    getAcademicInsights()      every published exam, subject
 *                                           marks (TE + CE), grades
 *   Attendance   getAttendanceInsights()    day-by-day record for the year
 *   Growth       getGrowthInsights()        character ratings, positive
 *                                           recognitions, teacher's summary
 *   Achievements getActivityInsights()      awards, certificates, activities
 *   Library      getReadingInsights()       books read, genres, reviews
 *
 * Each loader runs its queries inside ONE tenant-scoped transaction (one
 * pooled connection, one context setup) instead of a chain of separate
 * service calls. Everything is scoped to the caller-resolved studentId —
 * pages pass the signed-in student's OWN id (requireOwnStudentId), never
 * an id from the request.
 *
 * Portal visibility rules carried over unchanged:
 *   - exam results only for PUBLISHED examinations (published_at set);
 *   - achievements only when approved;
 *   - behaviour: only POSITIVE discipline categories are shown (a positive,
 *     developmental view — no shaming visuals of misconduct);
 *   - mentoring notes via listMentoringRecordsForPortal (its own
 *     confidentiality filter).
 */
import { getDbClient, type DbClient } from "../../services/db/client";
import { resolveGradeBand, subjectPercentFromUnits, type GradeUnit } from "../examination/grading";
import { getPublishedDailyAssessmentResultsForStudent, type StudentDailyAssessmentResult } from "../examination/service";
import { getPortfolioSummary, type PortfolioSummaryRecord } from "../portfolio-summary/service";
import { listMentoringRecordsForPortal, type MentoringRecordRow } from "../mentoring/service";
import { getLatestConsolidatedScore, type ConsolidatedScoreRecord } from "../scoring/service";

const RESULT_GRADE_LABEL =
  "case when r.is_frozen then coalesce(r.grade_label, gb.grade_label) else coalesce(gb.grade_label, r.grade_label) end";

export interface GradeBandLite { min_percent: number; max_percent: number; grade_label: string; color: string | null; description: string | null }

interface StudentPlacement {
  academic_year_id: string | null; year_name: string | null; year_start: string | null; year_end: string | null;
  class_id: string | null; section_id: string | null; class_label: string | null; roll_number: number | null;
}

async function loadPlacement(scoped: DbClient, studentId: string): Promise<StudentPlacement> {
  const { rows } = await scoped.query<StudentPlacement>(
    `select ay.id as academic_year_id, ay.name as year_name, ay.start_date::text as year_start, ay.end_date::text as year_end,
            se.class_id, se.section_id,
            case when c.id is null then null else c.name || coalesce(' ' || sec.name, '') end as class_label,
            se.roll_number
       from academic_years ay
       left join student_enrollments se on se.academic_year_id = ay.id and se.student_id = $1 and se.status = 'active'
       left join classes c on c.id = se.class_id
       left join sections sec on sec.id = se.section_id
      where ay.is_current = true
      limit 1`,
    [studentId]
  );
  return rows[0] ?? {
    academic_year_id: null, year_name: null, year_start: null, year_end: null,
    class_id: null, section_id: null, class_label: null, roll_number: null,
  };
}

// ---------------------------------------------------------------------------
// Academics
// ---------------------------------------------------------------------------
export interface ExamSubjectScore {
  subject_id: string; subject_name: string;
  /** TE + CE as a percentage (report-card rule); null when absent / no marks. */
  percent: number | null;
  obtained: number | null; max: number;
  absent: boolean;
  grade_label: string | null; grade_color: string | null;
}
export interface ExamOutcome {
  examination_id: string; name: string; date: string | null;
  percent: number; total: number; max_total: number;
  grade_label: string | null; grade_color: string | null;
  rank: number | null; is_pass: boolean | null;
  subjects: ExamSubjectScore[];
}
export interface AcademicInsights {
  /** Oldest first, so charts read left to right in time. */
  exams: ExamOutcome[];
  /** Grade bands of the most recent exam's scale (legend + grade chips). */
  bands: GradeBandLite[];
  dailyAssessments: StudentDailyAssessmentResult[];
  consolidated: ConsolidatedScoreRecord | null;
}

export async function getAcademicInsights(institutionId: string, authUserId: string, studentId: string): Promise<AcademicInsights> {
  const db = await getDbClient();
  const raw = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const placement = await loadPlacement(scoped, studentId);
    const { rows: exams } = await scoped.query<{
      examination_id: string; name: string; date: string | null; grade_scale_id: string | null;
      percent: number; total: number; max_total: number; grade_label: string | null; grade_color: string | null;
      rank: number | null; is_pass: boolean | null;
    }>(
      `select e.id as examination_id, e.name, e.start_date::text as date, e.grade_scale_id,
              r.percentage::float8 as percent, r.total_marks::float8 as total, r.max_total_marks::float8 as max_total,
              ${RESULT_GRADE_LABEL} as grade_label, coalesce(gb.color, r.grade_color) as grade_color,
              r.rank, r.is_pass
         from results r
         join examinations e on e.id = r.examination_id
         left join grade_bands gb on gb.id = r.grade_band_id
        where r.student_id = $1 and r.is_provisional = false and e.published_at is not null
        order by coalesce(e.start_date, r.computed_at::date) asc, r.computed_at asc`,
      [studentId]
    );
    const examIds = exams.map((e) => e.examination_id);
    const { rows: subjects } = examIds.length === 0 ? { rows: [] } : await scoped.query<{
      examination_id: string; subject_id: string; subject_name: string;
      te: number | null; te_max: number; te_absent: boolean;
      ce: number | null; ce_max: number; ce_all_absent: boolean;
    }>(
      `select es.examination_id, es.subject_id, sub.name as subject_name,
              m.marks_obtained::float8 as te, es.max_marks::float8 as te_max, coalesce(m.is_absent, false) as te_absent,
              ce.obtained as ce, coalesce(ce.max, 0) as ce_max, coalesce(ce.all_absent, false) as ce_all_absent
         from exam_subjects es
         join subjects sub on sub.id = es.subject_id
         join marks m on m.exam_subject_id = es.id and m.student_id = $1
         left join lateral (
           select sum(c.max_marks)::float8 as max,
                  sum(cm.marks_obtained) filter (where not coalesce(cm.is_absent, false))::float8 as obtained,
                  (count(cm.id) > 0 and bool_and(coalesce(cm.is_absent, false))) as all_absent
             from exam_ce_components c
             left join ce_marks cm on cm.ce_component_id = c.id and cm.student_id = $1
            where c.exam_subject_id = es.id
         ) ce on true
        where es.examination_id = any($2::uuid[])
        order by sub.name`,
      [studentId, examIds]
    );
    const scaleIds = [...new Set(exams.map((e) => e.grade_scale_id).filter((x): x is string => !!x))];
    const { rows: bandRows } = scaleIds.length === 0 ? { rows: [] } : await scoped.query<GradeBandLite & { grade_scale_id: string }>(
      `select grade_scale_id, min_percent::float8 as min_percent, max_percent::float8 as max_percent, grade_label, color, description
         from grade_bands where grade_scale_id = any($1::uuid[]) order by min_percent desc`,
      [scaleIds]
    );
    return { placement, exams, subjects, bandRows };
  });

  const bandsByScale = new Map<string, GradeBandLite[]>();
  for (const b of raw.bandRows) bandsByScale.set(b.grade_scale_id, [...(bandsByScale.get(b.grade_scale_id) ?? []), b]);

  const exams: ExamOutcome[] = raw.exams.map((e) => {
    const bands = e.grade_scale_id ? bandsByScale.get(e.grade_scale_id) ?? [] : [];
    const subjects = raw.subjects.filter((s) => s.examination_id === e.examination_id).map((s) => {
      const units: GradeUnit[] = [{ max: s.te_max, obtained: s.te, absent: s.te_absent }];
      if (s.ce_max > 0) units.push({ max: s.ce_max, obtained: s.ce, absent: s.ce_all_absent });
      const percent = subjectPercentFromUnits(units);
      const band = percent != null ? resolveGradeBand(bands, percent) : null;
      const sat = units.filter((u) => !u.absent);
      return {
        subject_id: s.subject_id, subject_name: s.subject_name,
        percent: percent != null ? Math.round(percent * 10) / 10 : null,
        obtained: sat.some((u) => u.obtained != null) ? sat.reduce((a, u) => a + (u.obtained ?? 0), 0) : null,
        max: sat.reduce((a, u) => a + u.max, 0),
        absent: units.every((u) => u.absent),
        grade_label: band?.grade_label ?? null, grade_color: band?.color ?? null,
      };
    });
    return {
      examination_id: e.examination_id, name: e.name, date: e.date,
      percent: Math.round(Number(e.percent) * 10) / 10, total: Number(e.total), max_total: Number(e.max_total),
      grade_label: e.grade_label, grade_color: e.grade_color, rank: e.rank, is_pass: e.is_pass, subjects,
    };
  });

  const latestScale = raw.exams.length > 0 ? raw.exams[raw.exams.length - 1].grade_scale_id : null;
  const [dailyAssessments, consolidated] = await Promise.all([
    raw.placement.class_id
      ? getPublishedDailyAssessmentResultsForStudent(institutionId, authUserId, studentId, raw.placement.class_id).catch(() => [])
      : Promise.resolve([]),
    getLatestConsolidatedScore(institutionId, authUserId, studentId).catch(() => null),
  ]);
  return {
    exams,
    bands: latestScale ? bandsByScale.get(latestScale) ?? [] : [],
    dailyAssessments, consolidated,
  };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export interface AttendanceDay { date: string; status: "present" | "absent" | "late"; label: string }
export interface AttendanceInsights {
  yearName: string | null; from: string | null; to: string | null;
  days: AttendanceDay[];
  holidays: { date: string; title: string }[];
  leaves: { id: string; start_date: string; end_date: string; reason: string | null; status: string }[];
}

export async function getAttendanceInsights(institutionId: string, authUserId: string, studentId: string): Promise<AttendanceInsights> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const p = await loadPlacement(scoped, studentId);
    if (!p.year_start || !p.year_end) return { yearName: null, from: null, to: null, days: [], holidays: [], leaves: [] };
    const [{ rows: days }, { rows: hol }, { rows: leaves }] = [
      await scoped.query<{ date: string; counts_as_present: boolean; is_late: boolean; label: string }>(
        `select ar.date::text as date, st.counts_as_present, ar.is_late, st.label
           from attendance_records ar join attendance_statuses st on st.id = ar.status_id
          where ar.student_id = $1 and ar.date between $2::date and $3::date
          order by ar.date`,
        [studentId, p.year_start, p.year_end]
      ),
      await scoped.query<{ start_date: string; end_date: string | null; title: string }>(
        `select start_date::text as start_date, end_date::text as end_date, title from calendar_events
          where event_type = 'holiday' and start_date <= $2::date and coalesce(end_date, start_date) >= $1::date`,
        [p.year_start, p.year_end]
      ),
      await scoped.query<{ id: string; start_date: string; end_date: string; reason: string | null; status: string }>(
        `select id, start_date::text as start_date, end_date::text as end_date, reason, status
           from leave_applications where applicant_type = 'student' and applicant_id = $1
          order by start_date desc limit 20`,
        [studentId]
      ),
    ];
    const holidays: { date: string; title: string }[] = [];
    for (const h of hol) {
      const end = h.end_date ?? h.start_date;
      for (let d = new Date(`${h.start_date}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        holidays.push({ date: d.toISOString().slice(0, 10), title: h.title });
      }
    }
    return {
      yearName: p.year_name, from: p.year_start, to: p.year_end,
      days: days.map((d) => ({ date: d.date, label: d.label, status: !d.counts_as_present ? "absent" : d.is_late ? "late" : "present" })),
      holidays, leaves,
    };
  });
}

// ---------------------------------------------------------------------------
// Growth & conduct
// ---------------------------------------------------------------------------
export interface CharacterPeriod { period: string; ratings: { attribute: string; rating: number; notes: string | null }[] }
export interface GrowthInsights {
  attributes: string[];
  /** Assessment periods in the order they were recorded, oldest first. */
  periods: CharacterPeriod[];
  ratingLabels: { rating: number; label: string }[];
  recognitions: { id: string; date: string; category: string; description: string | null }[];
  summary: PortfolioSummaryRecord | null;
  mentoring: MentoringRecordRow[];
}

export async function getGrowthInsights(institutionId: string, authUserId: string, studentId: string): Promise<GrowthInsights> {
  const db = await getDbClient();
  const raw = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const placement = await loadPlacement(scoped, studentId);
    const { rows: ratings } = await scoped.query<{ period: string; attribute: string; rating: number; notes: string | null; sort: number | null; first_at: string }>(
      `select ca.period, attr.name as attribute, ca.rating, ca.notes, attr.sort_order as sort,
              (min(ca.created_at) over (partition by ca.period))::text as first_at
         from character_assessments ca
         join character_attributes attr on attr.id = ca.attribute_id
        where ca.student_id = $1
        order by first_at, attr.sort_order nulls last, attr.name`,
      [studentId]
    );
    // No .catch() inside a transaction: a failed statement aborts the whole
    // transaction, so every later query would fail too.
    const { rows: ratingLabels } = await scoped.query<{ rating: number; label: string }>(
      "select rating::int as rating, label from character_rating_labels order by rating"
    );
    const { rows: recognitions } = await scoped.query<{ id: string; date: string; category: string; description: string | null }>(
      `select dr.id, dr.date::text as date, dc.name as category, dr.description
         from discipline_records dr join discipline_categories dc on dc.id = dr.category_id
        where dr.student_id = $1 and dc.is_positive = true
        order by dr.date desc limit 30`,
      [studentId]
    );
    return { placement, ratings, ratingLabels, recognitions };
  });

  const periods: CharacterPeriod[] = [];
  const attributes: string[] = [];
  for (const r of raw.ratings) {
    if (!attributes.includes(r.attribute)) attributes.push(r.attribute);
    let p = periods.find((x) => x.period === r.period);
    if (!p) { p = { period: r.period, ratings: [] }; periods.push(p); }
    p.ratings.push({ attribute: r.attribute, rating: r.rating, notes: r.notes });
  }
  const [summary, mentoring] = await Promise.all([
    raw.placement.academic_year_id
      ? getPortfolioSummary(institutionId, authUserId, studentId, raw.placement.academic_year_id).catch(() => null)
      : Promise.resolve(null),
    listMentoringRecordsForPortal(institutionId, authUserId, studentId).catch(() => []),
  ]);
  return { attributes, periods, ratingLabels: raw.ratingLabels, recognitions: raw.recognitions, summary, mentoring };
}

// ---------------------------------------------------------------------------
// Achievements & activities
// ---------------------------------------------------------------------------
export interface AchievementItem {
  id: string; title: string; category: string; level: string; level_order: number;
  position: string | null; points: number | null; certificate_file_id: string | null; date: string;
}
export interface ActivityItem { id: string; activity: string; type: string; status: string; date: string | null }
export interface ActivityInsights { achievements: AchievementItem[]; activities: ActivityItem[] }

export async function getActivityInsights(institutionId: string, authUserId: string, studentId: string): Promise<ActivityInsights> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: achievements } = await scoped.query<AchievementItem>(
      `select a.id, a.title, ac.name as category, al.name as level, al.sort_order as level_order,
              a."position" as position, a.points::float8 as points, a.certificate_file_id, a.created_at::date::text as date
         from achievements a
         join achievement_categories ac on ac.id = a.category_id
         join achievement_levels al on al.id = a.level_id
        where a.student_id = $1 and a.status = 'approved'
        order by a.created_at desc`,
      [studentId]
    );
    const { rows: activities } = await scoped.query<ActivityItem>(
      `select ss.id, sa.name as activity, st.name as type, ss.status,
              coalesce(ss.submitted_at, ss.created_at)::date::text as date
         from skill_submissions ss
         join skill_activities sa on sa.id = ss.skill_activity_id
         join skill_types st on st.id = sa.skill_type_id
        where ss.student_id = $1 and ss.status <> 'draft'
        order by coalesce(ss.submitted_at, ss.created_at) desc`,
      [studentId]
    );
    return { achievements, activities };
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
export interface ReadingInsights {
  books: { id: string; book_id: string; title: string; category: string | null; language: string | null; date: string; review_status: string }[];
  likesReceived: number;
}

export async function getReadingInsights(institutionId: string, authUserId: string, studentId: string): Promise<ReadingInsights> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: books } = await scoped.query<ReadingInsights["books"][number]>(
      `select rr.id, b.id as book_id, b.title, bc.name as category, coalesce(b.original_language, b.language) as language,
              rr.created_at::date::text as date, rr.review_status
         from reading_records rr
         join books b on b.id = rr.book_id
         left join book_categories bc on bc.id = b.category_id
        where rr.student_id = $1
        order by rr.created_at desc`,
      [studentId]
    );
    const { rows: likes } = await scoped.query<{ n: number }>(
      `select count(*)::int as n from review_reactions rx
         join reading_records rr on rr.id = rx.reading_record_id
        where rr.student_id = $1 and rx.reaction = 'like'`,
      [studentId]
    );
    return { books, likesReceived: likes[0]?.n ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface DashboardInsights {
  yearName: string | null; classLabel: string | null; rollNumber: number | null;
  /** Last up-to-8 published exam percentages, oldest first (sparkline). */
  recentExams: { name: string; percent: number; grade_label: string | null; grade_color: string | null }[];
  attendance: { present: number; total: number; percent: number | null };
  achievements: { total: number; podium: number };
  booksRead: number;
  upcoming: { id: string; kind: "exam" | "event"; title: string; type: string; start: string; end: string | null }[];
  todo: { readyToCollect: number; overdue: number; reviewsToWrite: number; awaitingApproval: number };
  kudos: { id: string; kind: string; message: string | null; from: string; date: string }[];
}

export async function getDashboardInsights(institutionId: string, authUserId: string, studentId: string): Promise<DashboardInsights> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const p = await loadPlacement(scoped, studentId);
    const { rows: recent } = await scoped.query<{ name: string; percent: number; grade_label: string | null; grade_color: string | null }>(
      `select * from (
         select e.name, r.percentage::float8 as percent, ${RESULT_GRADE_LABEL} as grade_label,
                coalesce(gb.color, r.grade_color) as grade_color,
                coalesce(e.start_date, r.computed_at::date) as d, r.computed_at
           from results r
           join examinations e on e.id = r.examination_id
           left join grade_bands gb on gb.id = r.grade_band_id
          where r.student_id = $1 and r.is_provisional = false and e.published_at is not null
          order by d desc, r.computed_at desc limit 8
       ) x order by d asc, computed_at asc`,
      [studentId]
    );
    const { rows: att } = p.year_start ? await scoped.query<{ present: number; total: number }>(
      `select count(*) filter (where st.counts_as_present)::int as present, count(*)::int as total
         from attendance_records ar join attendance_statuses st on st.id = ar.status_id
        where ar.student_id = $1 and ar.date between $2::date and $3::date`,
      [studentId, p.year_start, p.year_end]
    ) : { rows: [{ present: 0, total: 0 }] };
    const { rows: ach } = await scoped.query<{ total: number; podium: number }>(
      `select count(*)::int as total,
              count(*) filter (where lower(coalesce("position", '')) in ('1st', '2nd', '3rd', 'first', 'second', 'third'))::int as podium
         from achievements where student_id = $1 and status = 'approved'`,
      [studentId]
    );
    const { rows: books } = await scoped.query<{ n: number }>(
      "select count(distinct book_id)::int as n from reading_records where student_id = $1", [studentId]
    );
    const { rows: exams } = p.class_id ? await scoped.query<{ id: string; title: string; start: string; end: string | null }>(
      `select distinct e.id, e.name as title, e.start_date::text as start, e.end_date::text as "end"
         from examinations e
         join exam_classes ec on ec.examination_id = e.id
         left join exam_types et on et.id = e.exam_type_id
        where ec.class_id = $1 and (ec.section_id is null or ec.section_id = $2)
          and e.start_date is not null and coalesce(e.end_date, e.start_date) >= current_date
          and coalesce(et.is_daily_assessment, false) = false
        order by start limit 5`,
      [p.class_id, p.section_id]
    ) : { rows: [] };
    const { rows: events } = await scoped.query<{ id: string; title: string; type: string; start: string; end: string | null }>(
      `select id, title, event_type as type, start_date::text as start, end_date::text as "end"
         from calendar_events
        where coalesce(end_date, start_date) >= current_date and start_date <= current_date + 60
        order by start_date limit 8`
    );
    const { rows: todo } = await scoped.query<DashboardInsights["todo"]>(
      `select
         (select count(*)::int from book_holds where student_id = $1 and status = 'notified') as "readyToCollect",
         (select count(*)::int from book_issues where student_id = $1 and status = 'issued' and due_date < current_date) as overdue,
         (select count(*)::int from reading_records where student_id = $1 and review_status = 'pending' and coalesce(review_text, '') = '') as "reviewsToWrite",
         ((select count(*)::int from achievements where student_id = $1 and status = 'pending')
          + (select count(*)::int from skill_submissions where student_id = $1 and status in ('submitted', 'pending_review'))) as "awaitingApproval"`,
      [studentId]
    );
    const { rows: kudos } = await scoped.query<DashboardInsights["kudos"][number]>(
      `select k.id, k.kind, k.message, p.full_name as "from", k.created_at::date::text as date
         from kudos k join parents p on p.id = k.from_parent_id
        where k.to_student_id = $1 order by k.created_at desc limit 6`,
      [studentId]
    );
    const present = att[0]?.present ?? 0;
    const total = att[0]?.total ?? 0;
    const upcoming = [
      ...exams.map((e) => ({ ...e, kind: "exam" as const, type: "exam" })),
      ...events.map((e) => ({ ...e, kind: "event" as const })),
    ].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8);
    return {
      yearName: p.year_name, classLabel: p.class_label, rollNumber: p.roll_number,
      recentExams: recent.map((r) => ({ name: r.name, percent: Math.round(Number(r.percent) * 10) / 10, grade_label: r.grade_label, grade_color: r.grade_color })),
      attendance: { present, total, percent: total > 0 ? Math.round((present / total) * 1000) / 10 : null },
      achievements: { total: ach[0]?.total ?? 0, podium: ach[0]?.podium ?? 0 },
      booksRead: books[0]?.n ?? 0,
      upcoming,
      todo: todo[0] ?? { readyToCollect: 0, overdue: 0, reviewsToWrite: 0, awaitingApproval: 0 },
      kudos,
    };
  });
}
