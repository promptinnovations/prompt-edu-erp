/**
 * PROMPT EDU ERP — Achievements module service.
 * ARCHITECTURE.md §D.7, Phase 6 (§AA.2).
 *
 * achievement_categories/achievement_levels are institution CONFIGURATION
 * (§K/§254) — "Sahityotsav" etc. are seed DATA for the Badrudhuja tenant
 * (§42), never a platform-wide enum. Any institution can define its own.
 *
 * Lifecycle: pending -> (verified_by set) -> approved, or -> rejected at
 * either stage. verified_by/approved_by are separate columns (and separate
 * permissions, achievements.verify / achievements.approve) so one person
 * can check the record is genuine and a different person (per real
 * institutional practice) signs off on it counting toward recognition.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { recordScoreEvent } from "../scoring/service";
import { recordPortfolioEvent } from "../portfolio/service";

export interface AchievementCategoryRecord { id: string; name: string }
export interface AchievementLevelRecord { id: string; name: string; sort_order: number }
export interface AchievementRecord {
  id: string; student_id: string; category_id: string; level_id: string; title: string;
  position: string | null; points: string | null; status: string; verified_by: string | null; approved_by: string | null;
  certificate_file_id: string | null;
}
export interface AchievementRow extends AchievementRecord {
  student_name: string; category_name: string; level_name: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export async function listAchievementCategories(institutionId: string, authUserId: string): Promise<AchievementCategoryRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AchievementCategoryRecord>("select id, name from achievement_categories order by name");
    return rows;
  });
}

export async function listAchievementLevels(institutionId: string, authUserId: string): Promise<AchievementLevelRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AchievementLevelRecord>("select id, name, sort_order from achievement_levels order by sort_order");
    return rows;
  });
}

const createCategorySchema = z.object({ name: z.string().min(1).max(150) });
export async function createAchievementCategory(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createCategorySchema>
): Promise<AchievementCategoryRecord> {
  const data = createCategorySchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AchievementCategoryRecord>(
      "insert into achievement_categories (institution_id, name) values ($1, $2) returning id, name",
      [institutionId, data.name]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "achievements", entityType: "achievement_categories", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const createLevelSchema = z.object({ name: z.string().min(1).max(100), sortOrder: z.number().int().default(0) });
export async function createAchievementLevel(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createLevelSchema>
): Promise<AchievementLevelRecord> {
  const data = createLevelSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AchievementLevelRecord>(
      "insert into achievement_levels (institution_id, name, sort_order) values ($1, $2, $3) returning id, name, sort_order",
      [institutionId, data.name, data.sortOrder]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "achievements", entityType: "achievement_levels", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
const submitAchievementSchema = z.object({
  studentId: z.string().uuid(),
  categoryId: z.string().uuid(),
  levelId: z.string().uuid(),
  title: z.string().min(1).max(200),
  position: z.string().max(100).nullable().optional(),
  points: z.number().nullable().optional(),
  certificateFileId: z.string().uuid().nullable().optional(),
});

export async function submitAchievement(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof submitAchievementSchema>,
  scopedClient?: DbClient // §Q.1, see modules/academic/service.ts's createClass() for why
): Promise<AchievementRecord> {
  const data = submitAchievementSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<AchievementRecord>(
      `insert into achievements (institution_id, student_id, category_id, level_id, title, "position", points, status, certificate_file_id)
       values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       returning id, student_id, category_id, level_id, title, "position", points, status, verified_by, approved_by, certificate_file_id`,
      [institutionId, data.studentId, data.categoryId, data.levelId, data.title, data.position ?? null, data.points ?? null, data.certificateFileId ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "achievements", entityType: "achievements", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

export async function listAchievements(institutionId: string, authUserId: string, status?: string): Promise<AchievementRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = status
      ? await scoped.query<AchievementRow>(
          `select a.id, a.student_id, a.category_id, a.level_id, a.title, a."position", a.points, a.status, a.verified_by, a.approved_by, a.certificate_file_id,
                  s.full_name as student_name, c.name as category_name, l.name as level_name
             from achievements a
             join students s on s.id = a.student_id
             join achievement_categories c on c.id = a.category_id
             join achievement_levels l on l.id = a.level_id
            where a.status = $1
            order by a.created_at desc`,
          [status]
        )
      : await scoped.query<AchievementRow>(
          `select a.id, a.student_id, a.category_id, a.level_id, a.title, a."position", a.points, a.status, a.verified_by, a.approved_by, a.certificate_file_id,
                  s.full_name as student_name, c.name as category_name, l.name as level_name
             from achievements a
             join students s on s.id = a.student_id
             join achievement_categories c on c.id = a.category_id
             join achievement_levels l on l.id = a.level_id
            order by a.created_at desc`
        );
    return rows;
  });
}

/** Marks a pending achievement as verified (records verified_by, keeps
 *  status='pending' — a distinct achievements.approve call is still needed
 *  to actually count it). Rejects instead if the record isn't genuine. */
export async function verifyAchievement(
  institutionId: string, authUserId: string, userId: string, achievementId: string
): Promise<AchievementRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AchievementRecord>(
      `update achievements set verified_by = $1, updated_at = now() where id = $2 and status = 'pending'
       returning id, student_id, category_id, level_id, title, "position", points, status, verified_by, approved_by, certificate_file_id`,
      [userId, achievementId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "verify", module: "achievements", entityType: "achievements", entityId: achievementId, after: rows[0] });
    return rows[0];
  });
}

export async function rejectAchievement(
  institutionId: string, authUserId: string, userId: string, achievementId: string
): Promise<AchievementRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AchievementRecord>(
      `update achievements set status = 'rejected', updated_at = now() where id = $1 and status = 'pending'
       returning id, student_id, category_id, level_id, title, "position", points, status, verified_by, approved_by, certificate_file_id`,
      [achievementId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "reject", module: "achievements", entityType: "achievements", entityId: achievementId, after: rows[0] });
    return rows[0];
  });
}

/** Requires the achievement to already be verified (verified_by set) —
 *  approval without verification is refused rather than silently allowed.
 *  Unlike skills (which run every submission through the scoring_rules
 *  evaluator, §K), an achievement's points value is already set explicitly
 *  at submission time (§D.7) — approval here writes that value straight to
 *  score_events (scoringRuleId=null, since no scoring_rules row produced
 *  it) so the consolidated performance roll-up (§K.5) sees it either way. */
export async function approveAchievement(
  institutionId: string, authUserId: string, userId: string, achievementId: string
): Promise<AchievementRecord | null> {
  const db = await getDbClient();
  const approved = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: existing } = await scoped.query<{ verified_by: string | null; status: string }>(
      "select verified_by, status from achievements where id = $1", [achievementId]
    );
    if (existing.length === 0 || existing[0].status !== "pending") return null;
    if (!existing[0].verified_by) throw new Error("Achievement must be verified before it can be approved.");

    const { rows } = await scoped.query<AchievementRecord>(
      `update achievements set status = 'approved', approved_by = $1, updated_at = now() where id = $2
       returning id, student_id, category_id, level_id, title, "position", points, status, verified_by, approved_by, certificate_file_id`,
      [userId, achievementId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "approve", module: "achievements", entityType: "achievements", entityId: achievementId, after: rows[0] });
    return rows[0];
  });

  if (approved && approved.points !== null && Number(approved.points) !== 0) {
    await recordScoreEvent(institutionId, authUserId, userId, {
      studentId: approved.student_id, sourceModule: "achievements", sourceEntityType: "achievements",
      sourceEntityId: approved.id, points: Number(approved.points), scoringRuleId: null,
    });
  }

  if (approved) {
    const db2 = await getDbClient();
    const names = await db2.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const { rows } = await scoped.query<{ category_name: string; level_name: string }>(
        `select c.name as category_name, l.name as level_name
           from achievement_categories c, achievement_levels l
          where c.id = $1 and l.id = $2`,
        [approved.category_id, approved.level_id]
      );
      return rows[0] ?? null;
    });
    await recordPortfolioEvent(institutionId, authUserId, {
      studentId: approved.student_id, eventType: "achievement_approved", module: "achievements",
      entityType: "achievements", entityId: approved.id,
      title: approved.title,
      description: names ? `${names.category_name} — ${names.level_name}${approved.position ? ` (${approved.position})` : ""}` : null,
      score: approved.points !== null ? Number(approved.points) : null,
      approvedBy: userId,
    });
  }
  return approved;
}
