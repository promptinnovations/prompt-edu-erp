/**
 * PROMPT EDU ERP — Scoring engine + consolidated performance.
 * ARCHITECTURE.md §D.9, §K (Scoring Engine Architecture), §K.5, Phase 7.
 *
 * §K.1 "No institutional point value is ever a literal in application
 * code." Everything here reads scoring_rules/performance_components rows;
 * evaluate() is one generic evaluator, not one function per activity.
 *
 * Condition matching (§K.2/K.3): condition_jsonb keys encode the operator
 * by naming convention rather than a full expression language, deliberately
 * (§K.3.2 "NOT a full expression language in v1, to stay auditable and
 * safe"):
 *   "min_<field>": submission_data[<field>] >= value
 *   "max_<field>": submission_data[<field>] <= value
 *   "<field>":     submission_data[<field>] === value   (equality)
 * bonus_jsonb = {"per_extra_unit": N, "unit": "<field>", "bonus_points": P}
 * adds P for every N whole units submission_data[<field>] exceeds the
 * matched rule's own min_<field> threshold (0 if the rule has none).
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { getStudentAttendanceSummary } from "../attendance/service";
import { getCharacterScoreAverage } from "../discipline/service";

export interface ScoringRuleRecord {
  id: string; module: string; activity_code: string; condition_jsonb: Record<string, unknown>;
  points: string; bonus_jsonb: Record<string, unknown> | null; max_points: string | null;
  verification_required: boolean; approval_required: boolean; is_active: boolean;
}
export interface ScoreEventRecord {
  id: string; student_id: string; source_module: string; source_entity_type: string;
  source_entity_id: string | null; points: string; scoring_rule_id: string | null; computed_at: string;
}
export interface EvaluationResult {
  rule: ScoringRuleRecord | null;
  points: number;
}

// ---------------------------------------------------------------------------
// Scoring rules (config)
// ---------------------------------------------------------------------------
export async function listScoringRules(institutionId: string, authUserId: string, module?: string): Promise<ScoringRuleRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = module
      ? await scoped.query<ScoringRuleRecord>(
          `select id, module, activity_code, condition_jsonb, points, bonus_jsonb, max_points,
                  verification_required, approval_required, is_active
             from scoring_rules where module = $1 order by activity_code`,
          [module]
        )
      : await scoped.query<ScoringRuleRecord>(
          `select id, module, activity_code, condition_jsonb, points, bonus_jsonb, max_points,
                  verification_required, approval_required, is_active
             from scoring_rules order by module, activity_code`
        );
    return rows;
  });
}

const createScoringRuleSchema = z.object({
  module: z.string().min(1).max(50),
  activityCode: z.string().min(1).max(100),
  conditionJsonb: z.record(z.unknown()).default({}),
  points: z.number(),
  bonusJsonb: z.record(z.unknown()).nullable().optional(),
  maxPoints: z.number().nullable().optional(),
  verificationRequired: z.boolean().default(true),
  approvalRequired: z.boolean().default(true),
});

export async function createScoringRule(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createScoringRuleSchema>
): Promise<ScoringRuleRecord> {
  const data = createScoringRuleSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ScoringRuleRecord>(
      `insert into scoring_rules
         (institution_id, module, activity_code, condition_jsonb, points, bonus_jsonb, max_points,
          verification_required, approval_required)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, module, activity_code, condition_jsonb, points, bonus_jsonb, max_points,
                 verification_required, approval_required, is_active`,
      [
        institutionId, data.module, data.activityCode, JSON.stringify(data.conditionJsonb), data.points,
        data.bonusJsonb ? JSON.stringify(data.bonusJsonb) : null, data.maxPoints ?? null,
        data.verificationRequired, data.approvalRequired,
      ]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "scoring", entityType: "scoring_rules", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

/** §137 follow-up ("sometimes configurations also will be different") —
 *  scoring_rules (the actual point values per activity) were createable
 *  but not editable/deletable through any UI: an institution wanting
 *  different points than Badrudhuja's seeded defaults (§K.4) had no way to
 *  change them short of a direct database edit. `points`/`maxPoints`/
 *  `bonusJsonb` are the fields real institutions will most often want to
 *  retune; `conditionJsonb` is included too since a threshold (e.g.
 *  "min_pages": 50) is just as much a per-institution number as the point
 *  value attached to it. */
const updateScoringRuleSchema = z.object({
  points: z.number().optional(),
  maxPoints: z.number().nullable().optional(),
  conditionJsonb: z.record(z.unknown()).optional(),
  bonusJsonb: z.record(z.unknown()).nullable().optional(),
  verificationRequired: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function updateScoringRule(
  institutionId: string, authUserId: string, userId: string, scoringRuleId: string, input: z.infer<typeof updateScoringRuleSchema>
): Promise<ScoringRuleRecord> {
  const data = updateScoringRuleSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ScoringRuleRecord>(
      `update scoring_rules set
         points = coalesce($2, points),
         max_points = case when $3 then $4 else max_points end,
         condition_jsonb = coalesce($5, condition_jsonb),
         bonus_jsonb = case when $6 then $7 else bonus_jsonb end,
         verification_required = coalesce($8, verification_required),
         approval_required = coalesce($9, approval_required),
         is_active = coalesce($10, is_active)
       where id = $1
       returning id, module, activity_code, condition_jsonb, points, bonus_jsonb, max_points,
                 verification_required, approval_required, is_active`,
      [
        scoringRuleId, data.points ?? null,
        Object.prototype.hasOwnProperty.call(data, "maxPoints"), data.maxPoints ?? null,
        data.conditionJsonb ? JSON.stringify(data.conditionJsonb) : null,
        Object.prototype.hasOwnProperty.call(data, "bonusJsonb"), data.bonusJsonb ? JSON.stringify(data.bonusJsonb) : null,
        data.verificationRequired ?? null, data.approvalRequired ?? null, data.isActive ?? null,
      ]
    );
    if (!rows[0]) throw new Error("Scoring rule not found.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "scoring", entityType: "scoring_rules", entityId: scoringRuleId, after: rows[0] });
    return rows[0];
  });
}

/** Hard-deletes only if no score_events reference this rule yet (§K's
 *  config-vs-transaction separation means a rule that has already produced
 *  history must never disappear out from under it — score_events.scoring_rule_id
 *  has no ON DELETE clause, i.e. RESTRICT, so this guard is what turns that
 *  into a friendly error instead of a raw FK-violation stack trace, same
 *  pattern as deleteClass()/deleteGradeScale()). Deactivate (via
 *  updateScoringRule({ isActive: false })) is the right move for a rule
 *  that's already been used — it stops applying to new submissions while
 *  every past score_event keeps its provenance intact. */
export async function deleteScoringRule(institutionId: string, authUserId: string, userId: string, scoringRuleId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: used } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from score_events where scoring_rule_id = $1", [scoringRuleId]
    );
    if (Number(used[0]?.count ?? 0) > 0) {
      throw new Error("This scoring rule has already been used to award points — deactivate it instead of deleting it.");
    }
    const { rows } = await scoped.query("delete from scoring_rules where id = $1 returning id", [scoringRuleId]);
    if (rows.length === 0) throw new Error("Scoring rule not found.");
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "scoring", entityType: "scoring_rules", entityId: scoringRuleId });
  });
}

// ---------------------------------------------------------------------------
// Evaluator (§K.3)
// ---------------------------------------------------------------------------
function matchesCondition(condition: Record<string, unknown>, data: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(condition)) {
    if (key.startsWith("min_")) {
      const field = key.slice(4);
      const actual = Number(data[field]);
      if (!(actual >= Number(expected))) return false;
    } else if (key.startsWith("max_")) {
      const field = key.slice(4);
      const actual = Number(data[field]);
      if (!(actual <= Number(expected))) return false;
    } else {
      if (data[key] !== expected) return false;
    }
  }
  return true;
}

function computeBonus(bonus: Record<string, unknown> | null, condition: Record<string, unknown>, data: Record<string, unknown>): number {
  if (!bonus) return 0;
  const unit = String(bonus.unit ?? "");
  const perExtraUnit = Number(bonus.per_extra_unit ?? 0);
  const bonusPoints = Number(bonus.bonus_points ?? 0);
  if (!unit || perExtraUnit <= 0) return 0;
  const threshold = Number(condition[`min_${unit}`] ?? 0);
  const actual = Number(data[unit] ?? 0);
  const extra = Math.max(0, actual - threshold);
  const extraUnits = Math.floor(extra / perExtraUnit);
  return extraUnits * bonusPoints;
}

/** Evaluates a submission against every active scoring_rules row for
 *  (module, activityCode) and returns the first match (§K.3 step 1-2).
 *  Rule authors are responsible for keeping conditions mutually exclusive
 *  per activity — this deliberately does not "pick the best" match, to
 *  stay predictable and auditable (§K.3 "deliberately not a full
 *  expression language"). Returns { rule: null, points: 0 } if nothing
 *  matches, rather than guessing. */
export async function evaluateScoring(
  institutionId: string, authUserId: string, module: string, activityCode: string, submissionData: Record<string, unknown>
): Promise<EvaluationResult> {
  const rules = await listScoringRules(institutionId, authUserId, module);
  const candidate = rules.find((r) => r.is_active && r.activity_code === activityCode && matchesCondition(r.condition_jsonb, submissionData));
  if (!candidate) return { rule: null, points: 0 };

  const base = Number(candidate.points);
  const bonus = computeBonus(candidate.bonus_jsonb, candidate.condition_jsonb, submissionData);
  let total = base + bonus;
  if (candidate.max_points !== null) total = Math.min(total, Number(candidate.max_points));
  return { rule: candidate, points: total };
}

export async function recordScoreEvent(
  institutionId: string, authUserId: string, userId: string,
  input: { studentId: string; sourceModule: string; sourceEntityType: string; sourceEntityId: string | null; points: number; scoringRuleId: string | null }
): Promise<ScoreEventRecord> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ScoreEventRecord>(
      `insert into score_events (institution_id, student_id, source_module, source_entity_type, source_entity_id, points, scoring_rule_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, student_id, source_module, source_entity_type, source_entity_id, points, scoring_rule_id, computed_at`,
      [institutionId, input.studentId, input.sourceModule, input.sourceEntityType, input.sourceEntityId, input.points, input.scoringRuleId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "scoring", entityType: "score_events", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function listScoreEvents(institutionId: string, authUserId: string, studentId?: string): Promise<ScoreEventRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = studentId
      ? await scoped.query<ScoreEventRecord>(
          `select id, student_id, source_module, source_entity_type, source_entity_id, points, scoring_rule_id, computed_at
             from score_events where student_id = $1 order by computed_at desc`,
          [studentId]
        )
      : await scoped.query<ScoreEventRecord>(
          `select id, student_id, source_module, source_entity_type, source_entity_id, points, scoring_rule_id, computed_at
             from score_events order by computed_at desc`
        );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Performance profiles / components (§K.5 weighted roll-up config)
// ---------------------------------------------------------------------------
export interface PerformanceProfileRecord { id: string; name: string; is_default: boolean }
export interface PerformanceComponentRecord { id: string; component_module: string; weight_percent: string }

export async function getDefaultPerformanceProfile(institutionId: string, authUserId: string): Promise<PerformanceProfileRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PerformanceProfileRecord>(
      "select id, name, is_default from performance_profiles where is_default = true limit 1"
    );
    return rows[0] ?? null;
  });
}

export async function listPerformanceComponents(institutionId: string, authUserId: string, profileId: string): Promise<PerformanceComponentRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PerformanceComponentRecord>(
      "select id, component_module, weight_percent from performance_components where performance_profile_id = $1 order by weight_percent desc",
      [profileId]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Normalized per-component scores (§K.5 "normalized to 0-100 so weights are
// meaningful across modules") — reuses each module's own service rather
// than re-deriving the numbers, per §N.1 layering.
// ---------------------------------------------------------------------------
export async function getNormalizedScore(
  institutionId: string, authUserId: string, componentModule: string, studentId: string, fromDate: string, toDate: string
): Promise<number> {
  const db = await getDbClient();
  if (componentModule === "academic") {
    return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const { rows } = await scoped.query<{ avg_percentage: string | null }>(
        `select avg(percentage) as avg_percentage from results
          where student_id = $1 and computed_at between $2 and $3`,
        [studentId, fromDate, toDate]
      );
      return rows[0]?.avg_percentage ? Number(rows[0].avg_percentage) : 0;
    });
  }
  if (componentModule === "attendance") {
    const summary = await getStudentAttendanceSummary(institutionId, authUserId, studentId, fromDate, toDate);
    return summary.present_percent;
  }
  if (componentModule === "skills" || componentModule === "achievements" || componentModule === "library") {
    // §Page-7 follow-up "Points children gets for their...non academic
    // (Skills and achievements, discipline, library usage) will be kept as
    // points here" — library usage (currently just approved book reviews,
    // score_events.source_module='library', §M.3) is summed exactly like
    // skills/achievements rather than needing its own bespoke query; any
    // future library-scored activity (e.g. books-read count) automatically
    // joins this same total the moment a scoring_rules row with
    // module='library' exists, no code change required here.
    return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const sourceModule = componentModule; // score_events.source_module is 'skills'/'achievements'/'library'
      const { rows } = await scoped.query<{ total: string | null }>(
        `select sum(points) as total from score_events
          where student_id = $1 and source_module = $2 and computed_at between $3 and $4`,
        [studentId, sourceModule, fromDate, toDate]
      );
      const total = rows[0]?.total ? Number(rows[0].total) : 0;
      return Math.min(100, total); // §K.5 normalized to 0-100 — capped, not scaled, at this phase
    });
  }
  if (componentModule === "character") {
    // Phase 11: character_assessments now exists, so this is no longer an
    // "unbuilt" branch — Badrudhuja's own seeded performance_profile still
    // doesn't include a character component (see docs/SETUP.md), but any
    // institution can add a performance_components row for it without a
    // code change, same §K.5 promise as every other component.
    return getCharacterScoreAverage(institutionId, authUserId, studentId, fromDate, toDate);
  }
  // Unknown/unbuilt component module (e.g. "activities" — clubs/events
  // aren't built yet, §K.5 note) — return 0 rather than guessing.
  return 0;
}

export interface ConsolidatedScoreRecord {
  id: string; student_id: string; performance_profile_id: string; period: string;
  score: string; breakdown_jsonb: Record<string, number>; computed_at: string;
}

/** §K.5 ConsolidatedScoreService.compute(). period is an institution-
 *  meaningful label (e.g. "2026-2027 / Term 1") stored alongside the score;
 *  fromDate/toDate anchor what data window each component reads. */
export async function computeConsolidatedScore(
  institutionId: string, authUserId: string, studentId: string, period: string, fromDate: string, toDate: string
): Promise<ConsolidatedScoreRecord | null> {
  const profile = await getDefaultPerformanceProfile(institutionId, authUserId);
  if (!profile) return null;
  const components = await listPerformanceComponents(institutionId, authUserId, profile.id);
  if (components.length === 0) return null;

  let weightedSum = 0;
  const breakdown: Record<string, number> = {};
  for (const c of components) {
    const value = await getNormalizedScore(institutionId, authUserId, c.component_module, studentId, fromDate, toDate);
    breakdown[c.component_module] = value;
    weightedSum += (value * Number(c.weight_percent)) / 100;
  }
  const score = Math.round(weightedSum * 100) / 100;

  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ConsolidatedScoreRecord>(
      `insert into consolidated_scores (institution_id, student_id, performance_profile_id, period, score, breakdown_jsonb, computed_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (institution_id, student_id, performance_profile_id, period)
       do update set score = excluded.score, breakdown_jsonb = excluded.breakdown_jsonb, computed_at = now()
       returning id, student_id, performance_profile_id, period, score, breakdown_jsonb, computed_at`,
      [institutionId, studentId, profile.id, period, score, JSON.stringify(breakdown)]
    );
    return rows[0];
  });
}

export async function getLatestConsolidatedScore(institutionId: string, authUserId: string, studentId: string): Promise<ConsolidatedScoreRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ConsolidatedScoreRecord>(
      `select id, student_id, performance_profile_id, period, score, breakdown_jsonb, computed_at
         from consolidated_scores where student_id = $1 order by computed_at desc limit 1`,
      [studentId]
    );
    return rows[0] ?? null;
  });
}

export async function listConsolidatedScores(institutionId: string, authUserId: string, period?: string): Promise<ConsolidatedScoreRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = period
      ? await scoped.query<ConsolidatedScoreRecord>(
          `select id, student_id, performance_profile_id, period, score, breakdown_jsonb, computed_at
             from consolidated_scores where period = $1 order by score desc`,
          [period]
        )
      : await scoped.query<ConsolidatedScoreRecord>(
          `select id, student_id, performance_profile_id, period, score, breakdown_jsonb, computed_at
             from consolidated_scores order by computed_at desc`
        );
    return rows;
  });
}
