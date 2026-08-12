/**
 * PROMPT EDU ERP — Mentoring module service.
 * ARCHITECTURE.md §D.8 (Discipline, character, mentoring), §F.4/§75
 * (confidentiality rule), §F.5 (Mentoring: create/edit = assigned mentor
 * only; view = mentoring.view_all holders or the assigned mentor), Phase 11
 * (§AA.2).
 *
 * There is no separate "mentor assignment" table in the spec — a staff
 * member becomes "the mentor" for a student simply by being the mentor_id
 * on a mentoring_records row they authored. Every write function resolves
 * the ACTING user's own staff.id server-side and uses that as mentor_id;
 * callers can never supply an arbitrary mentor_id (would let anyone author
 * a note "as" someone else). Every read function takes an explicit `scope`
 * (computed by the caller from mentoring.view_all, per this project's
 * gate-1-is-always-an-explicit-param convention, §E) so "assigned mentor
 * only" visibility is enforced in the query itself, not just at the
 * server-action permission-check boundary.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export interface MentoringRecordRow {
  id: string; student_id: string; student_name: string; mentor_id: string; mentor_name: string;
  date: string; academic_observation: string | null; behaviour_observation: string | null;
  strengths: string | null; challenges: string | null; goals: string | null; action_plan: string | null;
  follow_up_date: string | null; confidentiality_level: string;
}

export interface MentoringScope {
  /** true if the caller holds mentoring.view_all (computed by the server action) */
  canViewAll: boolean;
  /** the caller's own staff.id, if they are a staff member; null otherwise */
  ownMentorStaffId: string | null;
}

/** Resolves the acting user's own staff.id, or null if they aren't a staff
 *  member of this institution. Used both to build a MentoringScope and to
 *  fix mentor_id server-side on create. */
export async function getOwnStaffId(institutionId: string, authUserId: string, userId: string): Promise<string | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>("select id from staff where user_id = $1", [userId]);
    return rows[0]?.id ?? null;
  });
}

const createMentoringRecordSchema = z.object({
  studentId: z.string().uuid(),
  date: z.string().min(1),
  academicObservation: z.string().max(2000).nullable().optional(),
  behaviourObservation: z.string().max(2000).nullable().optional(),
  strengths: z.string().max(1000).nullable().optional(),
  challenges: z.string().max(1000).nullable().optional(),
  goals: z.string().max(1000).nullable().optional(),
  actionPlan: z.string().max(1000).nullable().optional(),
  followUpDate: z.string().nullable().optional(),
  confidentialityLevel: z.enum(["standard", "restricted"]).default("standard"),
});

/** Creates a mentoring record authored by (and mentor_id fixed to) the
 *  acting user — throws if they aren't a staff member (§F.5 "Assigned
 *  mentor" is always a staff record, never a bare user account). */
export async function createMentoringRecord(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createMentoringRecordSchema>
): Promise<MentoringRecordRow> {
  const data = createMentoringRecordSchema.parse(input);
  const ownStaffId = await getOwnStaffId(institutionId, authUserId, userId);
  if (!ownStaffId) throw new Error("Only staff members can author mentoring records.");

  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into mentoring_records
         (institution_id, student_id, mentor_id, date, academic_observation, behaviour_observation,
          strengths, challenges, goals, action_plan, follow_up_date, confidentiality_level)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id`,
      [
        institutionId, data.studentId, ownStaffId, data.date,
        data.academicObservation ?? null, data.behaviourObservation ?? null,
        data.strengths ?? null, data.challenges ?? null, data.goals ?? null, data.actionPlan ?? null,
        data.followUpDate ?? null, data.confidentialityLevel,
      ]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "mentoring", entityType: "mentoring_records", entityId: rows[0].id, after: { studentId: data.studentId } });
    const { rows: full } = await scoped.query<MentoringRecordRow>(
      `select mr.id, mr.student_id, s.full_name as student_name, mr.mentor_id, u.full_name as mentor_name,
              mr.date, mr.academic_observation, mr.behaviour_observation, mr.strengths, mr.challenges,
              mr.goals, mr.action_plan, mr.follow_up_date, mr.confidentiality_level
         from mentoring_records mr
         join students s on s.id = mr.student_id
         join staff st on st.id = mr.mentor_id
         join users u on u.id = st.user_id
        where mr.id = $1`,
      [rows[0].id]
    );
    return full[0];
  });
}

/** §F.5: view is gated to mentoring.view_all holders (see everyone's
 *  records) OR the assigned mentor (sees only their own) — enforced here,
 *  not left to the caller to remember to filter. */
export async function listMentoringRecords(
  institutionId: string, authUserId: string, scope: MentoringScope, studentId?: string
): Promise<MentoringRecordRow[]> {
  if (!scope.canViewAll && !scope.ownMentorStaffId) return []; // neither view_all nor a mentor themselves
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (!scope.canViewAll) { params.push(scope.ownMentorStaffId); conditions.push(`mr.mentor_id = $${params.length}`); }
    if (studentId) { params.push(studentId); conditions.push(`mr.student_id = $${params.length}`); }
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await scoped.query<MentoringRecordRow>(
      `select mr.id, mr.student_id, s.full_name as student_name, mr.mentor_id, u.full_name as mentor_name,
              mr.date, mr.academic_observation, mr.behaviour_observation, mr.strengths, mr.challenges,
              mr.goals, mr.action_plan, mr.follow_up_date, mr.confidentiality_level
         from mentoring_records mr
         join students s on s.id = mr.student_id
         join staff st on st.id = mr.mentor_id
         join users u on u.id = st.user_id
        ${where}
        order by mr.date desc`,
      params
    );
    return rows;
  });
}

/** Fetches a single record only if the scope permits it — returns null
 *  (never throws) for both "doesn't exist" and "exists but not visible to
 *  you", so callers can't distinguish the two (no existence leak). */
export async function getMentoringRecord(
  institutionId: string, authUserId: string, scope: MentoringScope, mentoringRecordId: string
): Promise<MentoringRecordRow | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<MentoringRecordRow>(
      `select mr.id, mr.student_id, s.full_name as student_name, mr.mentor_id, u.full_name as mentor_name,
              mr.date, mr.academic_observation, mr.behaviour_observation, mr.strengths, mr.challenges,
              mr.goals, mr.action_plan, mr.follow_up_date, mr.confidentiality_level
         from mentoring_records mr
         join students s on s.id = mr.student_id
         join staff st on st.id = mr.mentor_id
         join users u on u.id = st.user_id
        where mr.id = $1`,
      [mentoringRecordId]
    );
    const record = rows[0];
    if (!record) return null;
    if (!scope.canViewAll && record.mentor_id !== scope.ownMentorStaffId) return null;
    return record;
  });
}

const updateMentoringRecordSchema = z.object({
  academicObservation: z.string().max(2000).nullable().optional(),
  behaviourObservation: z.string().max(2000).nullable().optional(),
  strengths: z.string().max(1000).nullable().optional(),
  challenges: z.string().max(1000).nullable().optional(),
  goals: z.string().max(1000).nullable().optional(),
  actionPlan: z.string().max(1000).nullable().optional(),
  followUpDate: z.string().nullable().optional(),
});

/** §F.5: edit is "Assigned mentor" only — not extended to mentoring.view_all
 *  holders, so an admin who can SEE every mentoring note still can't rewrite
 *  someone else's. Returns null if the record doesn't exist or the caller
 *  isn't its mentor (same no-existence-leak shape as getMentoringRecord). */
export async function updateMentoringRecord(
  institutionId: string, authUserId: string, userId: string, ownMentorStaffId: string | null,
  mentoringRecordId: string, input: z.infer<typeof updateMentoringRecordSchema>
): Promise<{ id: string } | null> {
  const data = updateMentoringRecordSchema.parse(input);
  if (!ownMentorStaffId) return null;
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `update mentoring_records set
         academic_observation = coalesce($1, academic_observation),
         behaviour_observation = coalesce($2, behaviour_observation),
         strengths = coalesce($3, strengths),
         challenges = coalesce($4, challenges),
         goals = coalesce($5, goals),
         action_plan = coalesce($6, action_plan),
         follow_up_date = coalesce($7, follow_up_date),
         updated_at = now()
       where id = $8 and mentor_id = $9
       returning id`,
      [
        data.academicObservation ?? null, data.behaviourObservation ?? null, data.strengths ?? null,
        data.challenges ?? null, data.goals ?? null, data.actionPlan ?? null, data.followUpDate ?? null,
        mentoringRecordId, ownMentorStaffId,
      ]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "mentoring", entityType: "mentoring_records", entityId: mentoringRecordId, after: data });
    return rows[0];
  });
}

/** Open (has a future/unset-resolved follow_up_date) mentoring goals for
 *  Student 360 (§L.4) — permission-gated by the caller before this is
 *  invoked, same as discipline's listRecentNegativeDisciplineFlags(). */
export async function listOpenMentoringGoals(
  institutionId: string, authUserId: string, scope: MentoringScope, studentId: string, limit = 5
): Promise<MentoringRecordRow[]> {
  const all = await listMentoringRecords(institutionId, authUserId, scope, studentId);
  return all.filter((r) => r.goals || r.action_plan).slice(0, limit);
}
