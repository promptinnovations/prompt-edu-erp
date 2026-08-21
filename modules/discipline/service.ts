/**
 * PROMPT EDU ERP — Discipline & character module service.
 * ARCHITECTURE.md §D.8 (Discipline, character, mentoring), Phase 11
 * (§AA.2).
 *
 * discipline_categories/character_attributes are institution CONFIGURATION
 * (§K/§254) — nothing here assumes particular category/attribute names.
 * Character assessments reuse discipline.view/discipline.record (see
 * migration 0013's header comment for why there's no separate
 * character.* permission).
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export interface DisciplineCategoryRecord { id: string; name: string; is_positive: boolean; is_active: boolean; sort_order: number }
export interface DisciplineRecordRow {
  id: string; student_id: string; student_name: string; category_id: string; category_name: string;
  is_positive: boolean; date: string; description: string | null; recorded_by: string | null; follow_up_notes: string | null;
  severity: string | null; action_taken: string | null; evidence_photo_file_id: string | null;
}
export interface CharacterAttributeRecord { id: string; name: string; is_active: boolean; sort_order: number }
export interface CharacterAssessmentRow {
  id: string; student_id: string; attribute_id: string; attribute_name: string;
  period: string; rating: number; assessed_by: string | null; notes: string | null;
}
export interface CharacterRatingLabelRecord { rating: number; label: string }

// ---------------------------------------------------------------------------
// Discipline categories (config)
// ---------------------------------------------------------------------------
// §354/AskUserQuestion ("Full CRUD: add, rename, reorder, deactivate") —
// includeInactive lets the admin config screen show deactivated categories
// (so they can be reactivated), while every record-entry dropdown elsewhere
// calls this with the default (active-only).
export async function listDisciplineCategories(
  institutionId: string, authUserId: string, opts?: { includeInactive?: boolean }
): Promise<DisciplineCategoryRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<DisciplineCategoryRecord>(
      `select id, name, is_positive, is_active, sort_order from discipline_categories
        ${opts?.includeInactive ? "" : "where is_active"}
        order by sort_order, is_positive desc, name`
    );
    return rows;
  });
}

const createCategorySchema = z.object({ name: z.string().min(1).max(150), isPositive: z.boolean().default(false) });
export async function createDisciplineCategory(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createCategorySchema>
): Promise<DisciplineCategoryRecord> {
  const data = createCategorySchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: maxRow } = await scoped.query<{ next: number }>(
      "select coalesce(max(sort_order), -1) + 1 as next from discipline_categories"
    );
    const { rows } = await scoped.query<DisciplineCategoryRecord>(
      `insert into discipline_categories (institution_id, name, is_positive, sort_order)
       values ($1, $2, $3, $4) returning id, name, is_positive, is_active, sort_order`,
      [institutionId, data.name, data.isPositive, maxRow[0].next]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "discipline", entityType: "discipline_categories", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const updateCategorySchema = z.object({ name: z.string().min(1).max(150).optional(), isPositive: z.boolean().optional() });
export async function updateDisciplineCategory(
  institutionId: string, authUserId: string, userId: string, categoryId: string, input: z.infer<typeof updateCategorySchema>
): Promise<DisciplineCategoryRecord> {
  const data = updateCategorySchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<DisciplineCategoryRecord>(
      `update discipline_categories set name = coalesce($2, name), is_positive = coalesce($3, is_positive)
       where id = $1 returning id, name, is_positive, is_active, sort_order`,
      [categoryId, data.name ?? null, data.isPositive ?? null]
    );
    if (!rows[0]) throw new Error("Discipline category not found.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "discipline", entityType: "discipline_categories", entityId: categoryId, after: rows[0] });
    return rows[0];
  });
}

/** Deactivate (never a hard delete) — every discipline_records row that
 *  already points at this category keeps working; it just stops showing up
 *  in new-record dropdowns (§354 "deactivate ... anytime" without losing
 *  history, same as skill_types.is_active elsewhere in this codebase). */
export async function setDisciplineCategoryActive(
  institutionId: string, authUserId: string, userId: string, categoryId: string, isActive: boolean
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query("update discipline_categories set is_active = $2 where id = $1 returning id", [categoryId, isActive]);
    if (rows.length === 0) throw new Error("Discipline category not found.");
    await recordAudit(scoped, { institutionId, userId, action: isActive ? "activate" : "deactivate", module: "discipline", entityType: "discipline_categories", entityId: categoryId });
  });
}

/** Reorder by swapping sort_order with the immediate neighbor in the
 *  direction requested — simple, dependency-free "move up/move down" UI
 *  instead of a drag-and-drop library (no such dependency is available in
 *  this build). */
export async function moveDisciplineCategory(
  institutionId: string, authUserId: string, userId: string, categoryId: string, direction: "up" | "down"
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: all } = await scoped.query<{ id: string; sort_order: number }>(
      "select id, sort_order from discipline_categories order by sort_order"
    );
    const idx = all.findIndex((c) => c.id === categoryId);
    if (idx === -1) throw new Error("Discipline category not found.");
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) return; // already at the edge — no-op
    const a = all[idx], b = all[swapIdx];
    await scoped.query("update discipline_categories set sort_order = $2 where id = $1", [a.id, b.sort_order]);
    await scoped.query("update discipline_categories set sort_order = $2 where id = $1", [b.id, a.sort_order]);
    await recordAudit(scoped, { institutionId, userId, action: "reorder", module: "discipline", entityType: "discipline_categories", entityId: categoryId });
  });
}

// ---------------------------------------------------------------------------
// Discipline records
// ---------------------------------------------------------------------------
const createRecordSchema = z.object({
  studentId: z.string().uuid(),
  categoryId: z.string().uuid(),
  date: z.string().min(1),
  description: z.string().max(2000).nullable().optional(), // "Remarks"
  severity: z.string().max(50).nullable().optional(),
  actionTaken: z.string().max(2000).nullable().optional(),
  evidencePhotoFileId: z.string().uuid().nullable().optional(),
});

/** Category -> Severity -> Action Taken -> Remarks -> Date -> Follow-up
 *  (§354) — description is "Remarks" (kept as the original column name to
 *  avoid a data migration); follow-up is recorded separately via
 *  recordDisciplineFollowUp() below, same two-step "create then follow up"
 *  shape mentoring_records already uses. */
export async function createDisciplineRecord(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createRecordSchema>
): Promise<{ id: string }> {
  const data = createRecordSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into discipline_records (institution_id, student_id, category_id, date, description, severity, action_taken, evidence_photo_file_id, recorded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [institutionId, data.studentId, data.categoryId, data.date, data.description ?? null, data.severity ?? null, data.actionTaken ?? null, data.evidencePhotoFileId ?? null, userId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "discipline", entityType: "discipline_records", entityId: rows[0].id, after: { categoryId: data.categoryId } });
    return rows[0];
  });
}

/** classId (§Page-2 follow-up "Discipline Records" on the class page) is
 *  resolved via the student's CURRENT active enrollment, same convention
 *  listStudentsForAdmin() uses — a discipline record has no class_id of its
 *  own (it's dated, not year-scoped), so "this class's records" always means
 *  "records for students currently in this class", not a historical
 *  as-of-the-record's-date lookup. */
export async function listDisciplineRecords(
  institutionId: string, authUserId: string, studentId?: string, classId?: string
): Promise<DisciplineRecordRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (studentId) { params.push(studentId); conditions.push(`dr.student_id = $${params.length}`); }
    if (classId) {
      params.push(classId);
      conditions.push(
        `dr.student_id in (select se.student_id from student_enrollments se where se.class_id = $${params.length} and se.status = 'active')`
      );
    }
    const { rows } = await scoped.query<DisciplineRecordRow>(
      `select dr.id, dr.student_id, s.full_name as student_name, dr.category_id, dc.name as category_name,
              dc.is_positive, dr.date, dr.description, dr.recorded_by, dr.follow_up_notes,
              dr.severity, dr.action_taken, dr.evidence_photo_file_id
         from discipline_records dr
         join students s on s.id = dr.student_id
         join discipline_categories dc on dc.id = dr.category_id
        ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
        order by dr.date desc`,
      params
    );
    return rows;
  });
}

const followUpSchema = z.object({ followUpNotes: z.string().max(2000) });
export async function recordDisciplineFollowUp(
  institutionId: string, authUserId: string, userId: string, disciplineRecordId: string, input: z.infer<typeof followUpSchema>
): Promise<{ id: string } | null> {
  const data = followUpSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `update discipline_records set follow_up_notes = $1, updated_at = now() where id = $2 returning id`,
      [data.followUpNotes, disciplineRecordId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "follow_up", module: "discipline", entityType: "discipline_records", entityId: disciplineRecordId, after: data });
    return rows[0];
  });
}

/** Active discipline flags for Student 360 (§L.4) — recent NEGATIVE
 *  discipline_records only, permission-gated by the caller (discipline.view)
 *  before this is invoked, same pattern as getStudent360()'s other fan-out
 *  calls. "Active" here means "within the lookback window", since there is
 *  no separate open/closed status on discipline_records (§D.8). */
export async function listRecentNegativeDisciplineFlags(
  institutionId: string, authUserId: string, studentId: string, sinceDate: string, limit = 5
): Promise<DisciplineRecordRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<DisciplineRecordRow>(
      `select dr.id, dr.student_id, s.full_name as student_name, dr.category_id, dc.name as category_name,
              dc.is_positive, dr.date, dr.description, dr.recorded_by, dr.follow_up_notes,
              dr.severity, dr.action_taken, dr.evidence_photo_file_id
         from discipline_records dr
         join students s on s.id = dr.student_id
         join discipline_categories dc on dc.id = dr.category_id
        where dr.student_id = $1 and dc.is_positive = false and dr.date >= $2
        order by dr.date desc
        limit $3`,
      [studentId, sinceDate, limit]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Character attributes (config) + assessments
// ---------------------------------------------------------------------------
export async function listCharacterAttributes(
  institutionId: string, authUserId: string, opts?: { includeInactive?: boolean }
): Promise<CharacterAttributeRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<CharacterAttributeRecord>(
      `select id, name, is_active, sort_order from character_attributes
        ${opts?.includeInactive ? "" : "where is_active"}
        order by sort_order, name`
    );
    return rows;
  });
}

const createAttributeSchema = z.object({ name: z.string().min(1).max(100) });
export async function createCharacterAttribute(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createAttributeSchema>
): Promise<CharacterAttributeRecord> {
  const data = createAttributeSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: maxRow } = await scoped.query<{ next: number }>(
      "select coalesce(max(sort_order), -1) + 1 as next from character_attributes"
    );
    const { rows } = await scoped.query<CharacterAttributeRecord>(
      `insert into character_attributes (institution_id, name, sort_order) values ($1, $2, $3)
       returning id, name, is_active, sort_order`,
      [institutionId, data.name, maxRow[0].next]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "discipline", entityType: "character_attributes", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const updateAttributeSchema = z.object({ name: z.string().min(1).max(100) });
export async function updateCharacterAttribute(
  institutionId: string, authUserId: string, userId: string, attributeId: string, input: z.infer<typeof updateAttributeSchema>
): Promise<CharacterAttributeRecord> {
  const data = updateAttributeSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<CharacterAttributeRecord>(
      "update character_attributes set name = $2 where id = $1 returning id, name, is_active, sort_order",
      [attributeId, data.name]
    );
    if (!rows[0]) throw new Error("Character attribute not found.");
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "discipline", entityType: "character_attributes", entityId: attributeId, after: rows[0] });
    return rows[0];
  });
}

export async function setCharacterAttributeActive(
  institutionId: string, authUserId: string, userId: string, attributeId: string, isActive: boolean
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query("update character_attributes set is_active = $2 where id = $1 returning id", [attributeId, isActive]);
    if (rows.length === 0) throw new Error("Character attribute not found.");
    await recordAudit(scoped, { institutionId, userId, action: isActive ? "activate" : "deactivate", module: "discipline", entityType: "character_attributes", entityId: attributeId });
  });
}

export async function moveCharacterAttribute(
  institutionId: string, authUserId: string, userId: string, attributeId: string, direction: "up" | "down"
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: all } = await scoped.query<{ id: string; sort_order: number }>(
      "select id, sort_order from character_attributes order by sort_order"
    );
    const idx = all.findIndex((c) => c.id === attributeId);
    if (idx === -1) throw new Error("Character attribute not found.");
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) return;
    const a = all[idx], b = all[swapIdx];
    await scoped.query("update character_attributes set sort_order = $2 where id = $1", [a.id, b.sort_order]);
    await scoped.query("update character_attributes set sort_order = $2 where id = $1", [b.id, a.sort_order]);
    await recordAudit(scoped, { institutionId, userId, action: "reorder", module: "discipline", entityType: "character_attributes", entityId: attributeId });
  });
}

// ---------------------------------------------------------------------------
// Character rating scale labels (config) — "Use a configurable 5-point
// rating scale" (§354). Seeded per-institution (migration 0037) with
// Outstanding/Very Good/Good/Needs Improvement/Requires Attention; renaming
// a label never touches character_assessments.rating (still plain 1-5), so
// historical averages/getCharacterScoreAverage() are unaffected by a
// relabel.
// ---------------------------------------------------------------------------
export async function listCharacterRatingLabels(institutionId: string, authUserId: string): Promise<CharacterRatingLabelRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<CharacterRatingLabelRecord>(
      "select rating, label from character_rating_labels order by rating"
    );
    return rows;
  });
}

const updateRatingLabelSchema = z.object({ label: z.string().min(1).max(50) });
export async function updateCharacterRatingLabel(
  institutionId: string, authUserId: string, userId: string, rating: number, input: z.infer<typeof updateRatingLabelSchema>
): Promise<CharacterRatingLabelRecord> {
  const data = updateRatingLabelSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<CharacterRatingLabelRecord>(
      `insert into character_rating_labels (institution_id, rating, label) values ($1, $2, $3)
       on conflict (institution_id, rating) do update set label = excluded.label, updated_at = now()
       returning rating, label`,
      [institutionId, rating, data.label]
    );
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "discipline", entityType: "character_rating_labels", entityId: String(rating), after: rows[0] });
    return rows[0];
  });
}

const createAssessmentSchema = z.object({
  studentId: z.string().uuid(),
  attributeId: z.string().uuid(),
  period: z.string().min(1).max(50),
  rating: z.number().int().min(1).max(5),
  notes: z.string().max(1000).nullable().optional(),
});

export async function recordCharacterAssessment(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createAssessmentSchema>
): Promise<{ id: string }> {
  const data = createAssessmentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into character_assessments (institution_id, student_id, attribute_id, period, rating, assessed_by, notes)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [institutionId, data.studentId, data.attributeId, data.period, data.rating, userId, data.notes ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "discipline", entityType: "character_assessments", entityId: rows[0].id, after: { attributeId: data.attributeId, rating: data.rating } });
    return rows[0];
  });
}

export async function listCharacterAssessments(
  institutionId: string, authUserId: string, studentId?: string
): Promise<CharacterAssessmentRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = studentId
      ? await scoped.query<CharacterAssessmentRow>(
          `select ca.id, ca.student_id, ca.attribute_id, at.name as attribute_name, ca.period, ca.rating, ca.assessed_by, ca.notes
             from character_assessments ca join character_attributes at on at.id = ca.attribute_id
            where ca.student_id = $1
            order by ca.created_at desc`,
          [studentId]
        )
      : await scoped.query<CharacterAssessmentRow>(
          `select ca.id, ca.student_id, ca.attribute_id, at.name as attribute_name, ca.period, ca.rating, ca.assessed_by, ca.notes
             from character_assessments ca join character_attributes at on at.id = ca.attribute_id
            order by ca.created_at desc`
        );
    return rows;
  });
}

/** Average character rating over a date range, normalized to 0-100
 *  (rating/5*100) — consumed by modules/scoring/service.ts's
 *  getNormalizedScore('character', ...) so the scoring engine never has to
 *  know character_assessments' internal 1-5 rating scale. Returns 0 when
 *  no assessments exist in the window (never null — consistent with every
 *  other getNormalizedScore() branch, §K.5). */
export async function getCharacterScoreAverage(
  institutionId: string, authUserId: string, studentId: string, fromDate: string, toDate: string
): Promise<number> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ avg_rating: string | null }>(
      `select avg(rating) as avg_rating from character_assessments
        where student_id = $1 and created_at::date between $2 and $3`,
      [studentId, fromDate, toDate]
    );
    const avgRating = rows[0]?.avg_rating ? Number(rows[0].avg_rating) : 0;
    return Math.round((avgRating / 5) * 10000) / 100;
  });
}
