/**
 * PROMPT EDU ERP — Skills module service (reading/writing/speaking/language
 * activities). ARCHITECTURE.md §D.7, Phase 6 (§AA.2).
 *
 * skill_types/skill_activities are institution CONFIGURATION (§K/§254) —
 * nothing here assumes particular skill names or workflow requirements;
 * every submission's evidence/verification/approval requirement is read
 * from the activity row, not hard-coded.
 *
 * Submission lifecycle: draft -> submitted -> pending_review ->
 * approved|rejected|returned (§D.7). Whether a submission needs a second
 * approval step after review is entirely config-driven via
 * skill_activities.approval_required — reviewSkillSubmission() branches on
 * it instead of assuming every activity works the same way.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { evaluateScoring, recordScoreEvent } from "../scoring/service";
import { recordPortfolioEvent } from "../portfolio/service";

export interface SkillTypeRecord { id: string; code: string; name: string }
export interface SkillActivityRecord {
  id: string; skill_type_id: string; name: string; description: string | null;
  evidence_required: boolean; verification_required: boolean; approval_required: boolean; is_active: boolean;
}
export interface SkillSubmissionRecord {
  id: string; skill_activity_id: string; student_id: string; submitted_at: string | null;
  details_jsonb: unknown; status: string; evidence_file_id: string | null;
}
export interface SkillSubmissionRow extends SkillSubmissionRecord {
  student_name: string; activity_name: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export async function listSkillTypes(institutionId: string, authUserId: string): Promise<SkillTypeRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SkillTypeRecord>("select id, code, name from skill_types order by name");
    return rows;
  });
}

export async function listSkillActivities(institutionId: string, authUserId: string, skillTypeId?: string): Promise<SkillActivityRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = skillTypeId
      ? await scoped.query<SkillActivityRecord>(
          `select id, skill_type_id, name, description, evidence_required, verification_required, approval_required, is_active
             from skill_activities where skill_type_id = $1 and is_active = true order by name`,
          [skillTypeId]
        )
      : await scoped.query<SkillActivityRecord>(
          `select id, skill_type_id, name, description, evidence_required, verification_required, approval_required, is_active
             from skill_activities where is_active = true order by name`
        );
    return rows;
  });
}

/** Admin-config view of activities — includes inactive ones (unlike
 *  listSkillActivities(), which is the submission-form-facing list and
 *  deliberately only shows currently-active activities) so a Settings
 *  screen can display/reactivate something that was deactivated instead of
 *  hard-deleted. */
export async function listSkillActivitiesForAdmin(institutionId: string, authUserId: string, skillTypeId?: string): Promise<SkillActivityRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = skillTypeId
      ? await scoped.query<SkillActivityRecord>(
          `select id, skill_type_id, name, description, evidence_required, verification_required, approval_required, is_active
             from skill_activities where skill_type_id = $1 order by name`,
          [skillTypeId]
        )
      : await scoped.query<SkillActivityRecord>(
          `select id, skill_type_id, name, description, evidence_required, verification_required, approval_required, is_active
             from skill_activities order by name`
        );
    return rows;
  });
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** §137 follow-up ("sometimes configurations also will be different") —
 *  skill_types/skill_activities had list functions since Phase 6 but no
 *  way for an institution admin to define their own (only seed scripts
 *  populated them, same gap grade_scales/scoring_rules/achievement
 *  categories all had). `code` is auto-derived from `name` (slugify()
 *  above already existed for this file's own internal use) so the admin
 *  never has to think about it, mirroring how exam_types' UI-facing form
 *  would work if one existed. */
const createSkillTypeSchema = z.object({ name: z.string().min(1).max(150) });

export async function createSkillType(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createSkillTypeSchema>
): Promise<SkillTypeRecord> {
  const data = createSkillTypeSchema.parse(input);
  const code = slugify(data.name);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SkillTypeRecord>(
      "insert into skill_types (institution_id, code, name) values ($1, $2, $3) returning id, code, name",
      [institutionId, code, data.name]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "skills", entityType: "skill_types", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const updateSkillTypeSchema = z.object({ name: z.string().min(1).max(150) });

export async function updateSkillType(
  institutionId: string, authUserId: string, userId: string, skillTypeId: string, input: z.infer<typeof updateSkillTypeSchema>
): Promise<SkillTypeRecord> {
  const data = updateSkillTypeSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SkillTypeRecord>(
      "update skill_types set name = $2 where id = $1 returning id, code, name", [skillTypeId, data.name]
    );
    if (!rows[0]) throw new Error("Skill type not found.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "skills", entityType: "skill_types", entityId: skillTypeId, after: rows[0] });
    return rows[0];
  });
}

/** Blocks deletion while any activity still exists under this type — both
 *  skill_activities.skill_type_id and skill_submissions.skill_activity_id
 *  cascade at the DB level (migration 0008), so an unguarded delete here
 *  would silently wipe out real submission history along with it. Removing
 *  every activity first (each individually guarded the same way below)
 *  makes that impossible to do by accident. */
export async function deleteSkillType(institutionId: string, authUserId: string, userId: string, skillTypeId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: activities } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from skill_activities where skill_type_id = $1", [skillTypeId]
    );
    if (Number(activities[0]?.count ?? 0) > 0) {
      throw new Error("This skill type still has activities under it — remove or deactivate those first.");
    }
    const { rows } = await scoped.query("delete from skill_types where id = $1 returning id", [skillTypeId]);
    if (rows.length === 0) throw new Error("Skill type not found.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "skills", entityType: "skill_types", entityId: skillTypeId });
  });
}

const createSkillActivitySchema = z.object({
  skillTypeId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  evidenceRequired: z.boolean().default(false),
  verificationRequired: z.boolean().default(true),
  approvalRequired: z.boolean().default(false),
});

export async function createSkillActivity(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createSkillActivitySchema>
): Promise<SkillActivityRecord> {
  const data = createSkillActivitySchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SkillActivityRecord>(
      `insert into skill_activities
         (institution_id, skill_type_id, name, description, evidence_required, verification_required, approval_required)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, skill_type_id, name, description, evidence_required, verification_required, approval_required, is_active`,
      [institutionId, data.skillTypeId, data.name, data.description ?? null, data.evidenceRequired, data.verificationRequired, data.approvalRequired]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "skills", entityType: "skill_activities", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const updateSkillActivitySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  evidenceRequired: z.boolean().optional(),
  verificationRequired: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function updateSkillActivity(
  institutionId: string, authUserId: string, userId: string, skillActivityId: string, input: z.infer<typeof updateSkillActivitySchema>
): Promise<SkillActivityRecord> {
  const data = updateSkillActivitySchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SkillActivityRecord>(
      `update skill_activities set
         name = coalesce($2, name),
         description = case when $3 then $4 else description end,
         evidence_required = coalesce($5, evidence_required),
         verification_required = coalesce($6, verification_required),
         approval_required = coalesce($7, approval_required),
         is_active = coalesce($8, is_active)
       where id = $1
       returning id, skill_type_id, name, description, evidence_required, verification_required, approval_required, is_active`,
      [
        skillActivityId, data.name ?? null,
        Object.prototype.hasOwnProperty.call(data, "description"), data.description ?? null,
        data.evidenceRequired ?? null, data.verificationRequired ?? null, data.approvalRequired ?? null, data.isActive ?? null,
      ]
    );
    if (!rows[0]) throw new Error("Skill activity not found.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "skills", entityType: "skill_activities", entityId: skillActivityId, after: rows[0] });
    return rows[0];
  });
}

/** Guarded the same way deleteScoringRule() is — an activity with real
 *  submissions against it cascades those away on a raw DELETE (migration
 *  0008's `on delete cascade`), so this refuses and points the admin at
 *  deactivating (updateSkillActivity({ isActive: false })) instead, which
 *  already hides it from listSkillActivities()'s active-only listing. */
export async function deleteSkillActivity(institutionId: string, authUserId: string, userId: string, skillActivityId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: used } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from skill_submissions where skill_activity_id = $1", [skillActivityId]
    );
    if (Number(used[0]?.count ?? 0) > 0) {
      throw new Error("This activity already has student submissions against it — deactivate it instead of deleting it.");
    }
    const { rows } = await scoped.query("delete from skill_activities where id = $1 returning id", [skillActivityId]);
    if (rows.length === 0) throw new Error("Skill activity not found.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "skills", entityType: "skill_activities", entityId: skillActivityId });
  });
}

/** The single point (§L.3) where an approved skill submission fans out to
 *  the scoring engine (§K, if a scoring_rules row matches — absence of a
 *  match is a valid institution choice, not an error) and ALWAYS to the
 *  portfolio timeline (§L.1) regardless of whether a rule matched, since
 *  the portfolio celebrates the activity itself, not just point-earning
 *  ones. activity_code for scoring is derived as a slug of the
 *  skill_activity's name (no dedicated code column on skill_activities —
 *  see docs/SETUP.md follow-ups for the alternative of adding one). */
async function onSkillSubmissionApproved(
  institutionId: string, authUserId: string, userId: string, submission: SkillSubmissionRecord
): Promise<void> {
  const db = await getDbClient();
  const activityInfo = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ name: string; skill_type_code: string; skill_type_name: string }>(
      `select sa.name, st.code as skill_type_code, st.name as skill_type_name
         from skill_activities sa join skill_types st on st.id = sa.skill_type_id
        where sa.id = $1`,
      [submission.skill_activity_id]
    );
    return rows[0] ?? null;
  });
  if (!activityInfo) return;

  const activityCode = slugify(activityInfo.name);
  const submissionData = (submission.details_jsonb as Record<string, unknown>) ?? {};
  const evaluation = await evaluateScoring(institutionId, authUserId, activityInfo.skill_type_code, activityCode, submissionData);

  if (evaluation.rule) {
    await recordScoreEvent(institutionId, authUserId, userId, {
      studentId: submission.student_id, sourceModule: "skills", sourceEntityType: "skill_submissions",
      sourceEntityId: submission.id, points: evaluation.points, scoringRuleId: evaluation.rule.id,
    });
  }

  await recordPortfolioEvent(institutionId, authUserId, {
    studentId: submission.student_id, eventType: "skill_approved", module: "skills",
    entityType: "skill_submissions", entityId: submission.id,
    title: `${activityInfo.skill_type_name}: ${activityInfo.name}`,
    description: evaluation.rule ? null : null,
    score: evaluation.rule ? evaluation.points : null,
    approvedBy: userId,
  });
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------
const createSubmissionSchema = z.object({
  skillActivityId: z.string().uuid(),
  studentId: z.string().uuid(),
  detailsJsonb: z.record(z.unknown()).optional(),
  evidenceFileId: z.string().uuid().nullable().optional(),
});

export async function createSkillSubmission(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createSubmissionSchema>
): Promise<SkillSubmissionRecord> {
  const data = createSubmissionSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SkillSubmissionRecord>(
      `insert into skill_submissions (institution_id, skill_activity_id, student_id, details_jsonb, status, evidence_file_id)
       values ($1, $2, $3, $4, 'draft', $5)
       returning id, skill_activity_id, student_id, submitted_at, details_jsonb, status, evidence_file_id`,
      [institutionId, data.skillActivityId, data.studentId, data.detailsJsonb ? JSON.stringify(data.detailsJsonb) : null, data.evidenceFileId ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "skills", entityType: "skill_submissions", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function submitSkillSubmission(
  institutionId: string, authUserId: string, userId: string, submissionId: string
): Promise<SkillSubmissionRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SkillSubmissionRecord>(
      `update skill_submissions set status = 'submitted', submitted_at = now(), updated_at = now()
         where id = $1 and status = 'draft'
       returning id, skill_activity_id, student_id, submitted_at, details_jsonb, status, evidence_file_id`,
      [submissionId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "submit", module: "skills", entityType: "skill_submissions", entityId: submissionId, after: rows[0] });
    return rows[0];
  });
}

export async function listSkillSubmissions(
  institutionId: string, authUserId: string, status?: string
): Promise<SkillSubmissionRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = status
      ? await scoped.query<SkillSubmissionRow>(
          `select ss.id, ss.skill_activity_id, ss.student_id, ss.submitted_at, ss.details_jsonb, ss.status, ss.evidence_file_id,
                  s.full_name as student_name, sa.name as activity_name
             from skill_submissions ss
             join students s on s.id = ss.student_id
             join skill_activities sa on sa.id = ss.skill_activity_id
            where ss.status = $1
            order by ss.submitted_at desc nulls last, ss.created_at desc`,
          [status]
        )
      : await scoped.query<SkillSubmissionRow>(
          `select ss.id, ss.skill_activity_id, ss.student_id, ss.submitted_at, ss.details_jsonb, ss.status, ss.evidence_file_id,
                  s.full_name as student_name, sa.name as activity_name
             from skill_submissions ss
             join students s on s.id = ss.student_id
             join skill_activities sa on sa.id = ss.skill_activity_id
            order by ss.submitted_at desc nulls last, ss.created_at desc`
        );
    return rows;
  });
}

/** Verify/reject/return a submitted skill submission (§D.7). If the
 *  activity does not require a separate approval step, a 'verified'
 *  decision closes the submission out as 'approved' immediately; otherwise
 *  it moves to pending_review awaiting approveSkillSubmission(). */
export async function reviewSkillSubmission(
  institutionId: string, authUserId: string, userId: string,
  submissionId: string, decision: "verified" | "rejected" | "returned", comments?: string
): Promise<SkillSubmissionRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: submissionRows } = await scoped.query<{ id: string; skill_activity_id: string; status: string }>(
      "select id, skill_activity_id, status from skill_submissions where id = $1", [submissionId]
    );
    if (submissionRows.length === 0 || submissionRows[0].status !== "submitted") return null;

    const { rows: activityRows } = await scoped.query<{ approval_required: boolean }>(
      "select approval_required from skill_activities where id = $1", [submissionRows[0].skill_activity_id]
    );
    const approvalRequired = activityRows[0]?.approval_required ?? false;

    let nextStatus: string;
    if (decision === "rejected") nextStatus = "rejected";
    else if (decision === "returned") nextStatus = "returned";
    else nextStatus = approvalRequired ? "pending_review" : "approved";

    const { rows } = await scoped.query<SkillSubmissionRecord>(
      `update skill_submissions set status = $1, updated_at = now() where id = $2
       returning id, skill_activity_id, student_id, submitted_at, details_jsonb, status, evidence_file_id`,
      [nextStatus, submissionId]
    );
    await scoped.query(
      `insert into skill_reviews (institution_id, skill_submission_id, reviewer_id, decision, comments)
       values ($1, $2, $3, $4, $5)`,
      [institutionId, submissionId, userId, decision, comments ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "review", module: "skills", entityType: "skill_submissions", entityId: submissionId, after: { decision, nextStatus } });
    return rows[0];
  }).then(async (reviewed) => {
    if (reviewed && reviewed.status === "approved") await onSkillSubmissionApproved(institutionId, authUserId, userId, reviewed);
    return reviewed;
  });
}

/** Final approval step — only meaningful for activities with
 *  approval_required=true; requires the most recent review decision to be
 *  'verified', mirroring the marks workflow's ordered-transition guard. */
export async function approveSkillSubmission(
  institutionId: string, authUserId: string, userId: string, submissionId: string, comments?: string
): Promise<SkillSubmissionRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: submissionRows } = await scoped.query<{ status: string }>(
      "select status from skill_submissions where id = $1", [submissionId]
    );
    if (submissionRows.length === 0 || submissionRows[0].status !== "pending_review") return null;

    const { rows: lastReview } = await scoped.query<{ decision: string }>(
      "select decision from skill_reviews where skill_submission_id = $1 order by reviewed_at desc limit 1",
      [submissionId]
    );
    if (lastReview[0]?.decision !== "verified") throw new Error("Submission has not been verified yet.");

    const { rows } = await scoped.query<SkillSubmissionRecord>(
      `update skill_submissions set status = 'approved', updated_at = now() where id = $1
       returning id, skill_activity_id, student_id, submitted_at, details_jsonb, status, evidence_file_id`,
      [submissionId]
    );
    await scoped.query(
      `insert into skill_reviews (institution_id, skill_submission_id, reviewer_id, decision, comments)
       values ($1, $2, $3, 'approved', $4)`,
      [institutionId, submissionId, userId, comments ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "approve", module: "skills", entityType: "skill_submissions", entityId: submissionId, after: rows[0] });
    return rows[0];
  }).then(async (approved) => {
    if (approved) await onSkillSubmissionApproved(institutionId, authUserId, userId, approved);
    return approved;
  });
}
