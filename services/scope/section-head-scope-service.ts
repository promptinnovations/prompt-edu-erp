/**
 * PROMPT EDU ERP — "Section Head" stage scope helper.
 *
 * §Attendance-follow-up-3 "Daily overview must be visible according to
 * roles — class for teacher, section wise for section heads, institution
 * wide - Principal, management". "Section" here is the school STAGE
 * grouping (classes.stage, migration 0032 — free text per institution,
 * standardized going forward as KG/LP/UP/HS/HSS), not the A/B/C class
 * subdivision (relabeled "Division" in the UI this same follow-up).
 *
 * Mirrors services/scope/teacher-scope-service.ts's shape and division of
 * responsibility exactly: this helper only answers "which stage(s) is this
 * person responsible for", it does not check permissions — callers decide,
 * via attendance.view_section, whether a caller needs this scoping applied
 * at all (an institution_admin/management holder with attendance.edit
 * never calls this; they're already unrestricted).
 */
import { getDbClient } from "../db/client";
import { stageRank } from "../academic/roster-order";

export interface SectionHeadScope {
  /** Every stage this user has been assigned to head. Empty if they hold
   *  attendance.view_section but haven't actually been assigned a stage yet
   *  (a real, expected state right after the role is granted — see
   *  assignSectionHead() below — not an error condition). */
  stages: Set<string>;
}

const EMPTY_SCOPE: SectionHeadScope = { stages: new Set() };

/** Resolves `userId`'s (a `users.id`, matching section_head_assignments.
 *  user_id — same convention teacher_assignments.user_id uses) assigned
 *  stages. Unlike teacher_assignments, this is NOT scoped to the current
 *  academic year — a Section Head's remit is an organizational role, not
 *  tied to one year's class rosters the way a subject/class-teacher
 *  assignment is. */
export async function getStaffSectionScope(
  institutionId: string, authUserId: string, userId: string
): Promise<SectionHeadScope> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ stage: string }>(
      "select stage from section_head_assignments where user_id = $1",
      [userId]
    );
    if (rows.length === 0) return EMPTY_SCOPE;
    return { stages: new Set(rows.map((r) => r.stage)) };
  });
}

export interface SectionHeadAssignmentRow {
  id: string; user_id: string; user_full_name: string; stage: string; created_at: string;
}

/** Every stage assignment in the institution — the admin-facing "who heads
 *  which section" list (Staff page). */
export async function listSectionHeadAssignments(institutionId: string, authUserId: string): Promise<SectionHeadAssignmentRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SectionHeadAssignmentRow>(
      `select sha.id, sha.user_id, u.full_name as user_full_name, sha.stage, sha.created_at
         from section_head_assignments sha
         join users u on u.id = sha.user_id`
    );
    // Canonical stage order (§users-roles follow-up), then name within a stage.
    return [...rows].sort((a, b) => {
      const ra = stageRank(a.stage), rb = stageRank(b.stage);
      if (ra !== rb) return (ra === -1 ? Infinity : ra) - (rb === -1 ? Infinity : rb);
      if (ra === -1 && a.stage !== b.stage) return a.stage.localeCompare(b.stage);
      return a.user_full_name.localeCompare(b.user_full_name);
    });
  });
}

/** Distinct stage values currently in use on any class — populates the
 *  "which section" dropdown when assigning a Section Head, so an admin
 *  picks from what actually exists rather than typing free text blind. */
export async function listDistinctStages(institutionId: string, authUserId: string): Promise<string[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ stage: string }>(
      "select distinct stage from classes where stage is not null and stage <> ''"
    );
    // Canonical KG/LP/UP/HS/HSS/GRADUATION/POST GRADUATION order, then any
    // institution-specific custom stage names alphabetically (§users-roles
    // follow-up "order MUST BE FOLLOWED EVERYWHERE").
    return rows.map((r) => r.stage).sort((a, b) => {
      const ra = stageRank(a), rb = stageRank(b);
      if (ra !== -1 || rb !== -1) return (ra === -1 ? Infinity : ra) - (rb === -1 ? Infinity : rb);
      return a.localeCompare(b);
    });
  });
}

export async function assignSectionHead(institutionId: string, authUserId: string, userId: string, stage: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      `insert into section_head_assignments (institution_id, user_id, stage) values ($1, $2, $3)
       on conflict (institution_id, user_id, stage) do nothing`,
      [institutionId, userId, stage]
    );
  });
}

export async function removeSectionHeadAssignment(institutionId: string, authUserId: string, assignmentId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query("delete from section_head_assignments where id = $1", [assignmentId]);
  });
}
