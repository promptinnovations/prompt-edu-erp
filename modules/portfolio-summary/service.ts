/**
 * PROMPT EDU ERP — Portfolio summary module service (migration 0061).
 *
 * §Portfolio-dashboard follow-up ("the student and parent portal should be
 * like this [reference dashboard with a Teacher's Overall Remark quote +
 * Strengths / Areas for Improvement / Future Goals checklists]"). Per
 * explicit answer to AskUserQuestion ("New dedicated portfolio-summary
 * record"), this is ONE standing row per student per academic year — set
 * by a class teacher/admin and shown on the portfolio dashboard — separate
 * from modules/mentoring/service.ts's per-SESSION notes (which keep their
 * own strengths/challenges/goals fields and their own cadence; this is not
 * a replacement for that log, just a different, slower-moving summary).
 *
 * Gated in the caller (not here) behind the same `student.edit` permission
 * the rest of the Student Portfolio tab's edit actions already use — no
 * new permission row needed for this module.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export interface PortfolioSummaryRecord {
  id: string;
  student_id: string;
  academic_year_id: string;
  overall_remark: string | null;
  strengths: string[];
  areas_for_improvement: string[];
  future_goals: string[];
  set_by: string | null;
  updated_at: string;
}

interface PortfolioSummaryDbRow {
  id: string; student_id: string; academic_year_id: string; overall_remark: string | null;
  strengths: string | null; areas_for_improvement: string | null; future_goals: string | null;
  set_by: string | null; updated_at: string;
}

const SELECT_COLUMNS = `id, student_id, academic_year_id, overall_remark, strengths, areas_for_improvement, future_goals, set_by, updated_at::text as updated_at`;

/** strengths/areas_for_improvement/future_goals are stored as a single
 *  newline-separated `text` column (matching mentoring_records' precedent
 *  — see the migration's header comment); blank lines are dropped so a
 *  trailing newline from the editor textarea doesn't become an empty
 *  checklist item. */
function splitLines(value: string | null): string[] {
  if (!value) return [];
  return value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

function toRecord(row: PortfolioSummaryDbRow): PortfolioSummaryRecord {
  return {
    id: row.id, student_id: row.student_id, academic_year_id: row.academic_year_id,
    overall_remark: row.overall_remark, set_by: row.set_by, updated_at: row.updated_at,
    strengths: splitLines(row.strengths),
    areas_for_improvement: splitLines(row.areas_for_improvement),
    future_goals: splitLines(row.future_goals),
  };
}

export async function getPortfolioSummary(
  institutionId: string, authUserId: string, studentId: string, academicYearId: string
): Promise<PortfolioSummaryRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PortfolioSummaryDbRow>(
      `select ${SELECT_COLUMNS} from portfolio_summaries where student_id = $1 and academic_year_id = $2`,
      [studentId, academicYearId]
    );
    return rows[0] ? toRecord(rows[0]) : null;
  });
}

const freeTextList = z.array(z.string().min(1).max(300)).max(20);

const upsertPortfolioSummarySchema = z.object({
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  overallRemark: z.string().max(2000).nullable().optional(),
  strengths: freeTextList,
  areasForImprovement: freeTextList,
  futureGoals: freeTextList,
});

/** One row per (student, academic year) — on conflict, replaces the whole
 *  summary (this is "the current standing remark", not a history log; the
 *  per-session mentoring notes are where history belongs). */
export async function upsertPortfolioSummary(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof upsertPortfolioSummarySchema>
): Promise<PortfolioSummaryRecord> {
  const data = upsertPortfolioSummarySchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PortfolioSummaryDbRow>(
      `insert into portfolio_summaries
         (institution_id, student_id, academic_year_id, overall_remark, strengths, areas_for_improvement, future_goals, set_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (student_id, academic_year_id) do update set
         overall_remark = excluded.overall_remark,
         strengths = excluded.strengths,
         areas_for_improvement = excluded.areas_for_improvement,
         future_goals = excluded.future_goals,
         set_by = excluded.set_by,
         updated_at = now()
       returning ${SELECT_COLUMNS}`,
      [
        institutionId, data.studentId, data.academicYearId, data.overallRemark ?? null,
        data.strengths.join("\n") || null, data.areasForImprovement.join("\n") || null, data.futureGoals.join("\n") || null,
        userId,
      ]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "upsert", module: "portfolio_summary",
      entityType: "portfolio_summaries", entityId: rows[0].id,
      after: { studentId: data.studentId, academicYearId: data.academicYearId },
    });
    return toRecord(rows[0]);
  });
}
