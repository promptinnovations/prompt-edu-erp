/**
 * PROMPT EDU ERP — Portfolio module service.
 * ARCHITECTURE.md §D.10, §L (Student Portfolio Architecture), Phase 8.
 *
 * §L.1 "Event-sourced, not a giant flat table": portfolio_events is an
 * append-only log referencing authoritative records via entity_type/
 * entity_id — this file never copies mark/achievement/submission payloads,
 * only enough to render a timeline row (date, title, description, score).
 *
 * §L.3 "Only status='approved' rows ever count... enforced at the single
 * point where portfolio_events are created". recordPortfolioEvent() IS
 * that single point — it is only ever called from an approval workflow
 * (see modules/skills/service.ts and modules/achievements/service.ts),
 * never from a submit/draft path. There is deliberately no
 * updatePortfolioEvent()/deletePortfolioEvent(): the log is append-only,
 * matching the spec's event-sourced framing.
 */
import { getDbClient } from "../../services/db/client";
import { getStudent, getCurrentEnrollment } from "../students/service";
import { getCurrentAcademicYear } from "../academic/service";
import { getStudentAttendanceSummary } from "../attendance/service";
import { getLatestConsolidatedScore } from "../scoring/service";
import { listRecentNegativeDisciplineFlags, type DisciplineRecordRow } from "../discipline/service";
import { listOpenMentoringGoals, type MentoringRecordRow, type MentoringScope } from "../mentoring/service";

export interface PortfolioEventRecord {
  id: string; student_id: string; event_type: string; module: string;
  entity_type: string; entity_id: string | null; event_date: string;
  title: string; description: string | null; score: string | null;
  approved_by: string | null; approved_at: string;
}

export async function recordPortfolioEvent(
  institutionId: string, authUserId: string,
  input: {
    studentId: string; eventType: string; module: string; entityType: string; entityId: string | null;
    eventDate?: string; title: string; description?: string | null; score?: number | null; approvedBy: string | null;
  }
): Promise<PortfolioEventRecord> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PortfolioEventRecord>(
      `insert into portfolio_events
         (institution_id, student_id, event_type, module, entity_type, entity_id, event_date, title, description, score, approved_by, status)
       values ($1, $2, $3, $4, $5, $6, coalesce($7, current_date), $8, $9, $10, $11, 'approved')
       returning id, student_id, event_type, module, entity_type, entity_id, event_date, title, description, score, approved_by, approved_at`,
      [
        institutionId, input.studentId, input.eventType, input.module, input.entityType, input.entityId,
        input.eventDate ?? null, input.title, input.description ?? null, input.score ?? null, input.approvedBy,
      ]
    );
    return rows[0];
  });
}

/** §L.2 timeline — approved events only (the table never holds anything
 *  else, but the explicit filter documents the contract at the read site
 *  too, matching the spec's own query shape). */
export async function listPortfolioTimeline(
  institutionId: string, authUserId: string, studentId: string, limit = 50
): Promise<PortfolioEventRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PortfolioEventRecord>(
      `select id, student_id, event_type, module, entity_type, entity_id, event_date, title, description, score, approved_by, approved_at
         from portfolio_events
        where student_id = $1 and status = 'approved'
        order by event_date desc, approved_at desc
        limit $2`,
      [studentId, limit]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Student 360° (§L.4) — a composition service, not a new denormalized
// table. Every field below is read through an existing module's own public
// service function (or, where no dedicated getter exists yet, a narrowly-
// scoped direct query equivalent to one) — nothing here recomputes numbers
// another service already owns.
// ---------------------------------------------------------------------------
export interface LatestResultSummary {
  examination_name: string; percentage: string; grade_label: string | null; computed_at: string;
}
export interface Student360Record {
  student: { id: string; full_name: string; admission_number: string; status: string } | null;
  enrollment: { class_id: string; section_id: string; academic_year_id: string } | null;
  latestResult: LatestResultSummary | null;
  attendanceSummary: { present_days: number; total_days: number; present_percent: number } | null;
  latestConsolidatedScore: { period: string; score: string; breakdown_jsonb: Record<string, number>; computed_at: string } | null;
  recentPortfolioEvents: PortfolioEventRecord[];
  // §L.4: "open mentoring goals (permission-gated)" / "active discipline
  // flags (permission-gated)" — both null unless the caller passes a
  // Student360Scope (added in Phase 11), so every pre-Phase-11 call site
  // keeps compiling/behaving unchanged (optional 5th param, not a redesign).
  openMentoringGoals: MentoringRecordRow[] | null;
  activeDisciplineFlags: DisciplineRecordRow[] | null;
}

export interface Student360Scope {
  mentoring?: MentoringScope;
  canViewDiscipline?: boolean;
}

export async function getStudent360(
  institutionId: string, authUserId: string, studentId: string, recentEventLimit = 10,
  scope?: Student360Scope
): Promise<Student360Record> {
  const student = await getStudent(institutionId, authUserId, studentId);
  const enrollment = await getCurrentEnrollment(institutionId, authUserId, studentId);

  const db = await getDbClient();
  const latestResult = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<LatestResultSummary>(
      `select e.name as examination_name, r.percentage, gb.grade_label, r.computed_at
         from results r
         join examinations e on e.id = r.examination_id
         left join grade_bands gb on gb.id = r.grade_band_id
        where r.student_id = $1
        order by r.computed_at desc
        limit 1`,
      [studentId]
    );
    return rows[0] ?? null;
  });

  // Attendance summary window: the current academic year to date, since
  // Student 360 is meant to reflect "this year, so far" rather than an
  // arbitrary caller-supplied range (§L.4 doesn't specify one).
  const academicYear = await getCurrentAcademicYear(institutionId, authUserId);
  const attendanceSummary = academicYear
    ? await getStudentAttendanceSummary(institutionId, authUserId, studentId, academicYear.start_date, academicYear.end_date)
    : null;

  const latestConsolidatedScore = await getLatestConsolidatedScore(institutionId, authUserId, studentId);
  const recentPortfolioEvents = await listPortfolioTimeline(institutionId, authUserId, studentId, recentEventLimit);

  const openMentoringGoals = scope?.mentoring
    ? await listOpenMentoringGoals(institutionId, authUserId, scope.mentoring, studentId)
    : null;
  const activeDisciplineFlags = scope?.canViewDiscipline
    ? await listRecentNegativeDisciplineFlags(
        institutionId, authUserId, studentId,
        academicYear?.start_date ?? "1900-01-01"
      )
    : null;

  return {
    student: student ? { id: student.id, full_name: student.full_name, admission_number: student.admission_number, status: student.status } : null,
    enrollment: enrollment ? { class_id: enrollment.class_id, section_id: enrollment.section_id, academic_year_id: enrollment.academic_year_id } : null,
    latestResult,
    attendanceSummary: attendanceSummary
      ? { present_days: attendanceSummary.present_days, total_days: attendanceSummary.total_days, present_percent: attendanceSummary.present_percent }
      : null,
    latestConsolidatedScore: latestConsolidatedScore
      ? { period: latestConsolidatedScore.period, score: latestConsolidatedScore.score, breakdown_jsonb: latestConsolidatedScore.breakdown_jsonb, computed_at: latestConsolidatedScore.computed_at }
      : null,
    recentPortfolioEvents,
    openMentoringGoals,
    activeDisciplineFlags,
  };
}
