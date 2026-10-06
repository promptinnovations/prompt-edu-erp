import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { can } from "../../services/permissions/permission-service";
import { getTeacherClassScope } from "../../services/scope/teacher-scope-service";
import { getCurrentEnrollment } from "../students/service";

/** Learner Record entries (migration 0059). Every section is rendered in the
 *  student/parent portals ONLY once it has at least one row, so nothing ever
 *  shows blank there; staff see every section as an entry form. */
import { LEARNER_SECTIONS, SECTION_META, type LearnerSection } from "./meta";
export { LEARNER_SECTIONS, SECTION_META };
export type { LearnerSection };

export interface LearnerEntry {
  id: string; student_id: string; section: LearnerSection; title: string; detail: string | null;
  value: string | null; level: string | null; period: string | null; hours: string | null;
  entry_date: string; evidence_file_id: string | null; entered_by_role: "staff" | "student";
}

const COLS = "id, student_id, section, title, detail, value, level, period, hours, entry_date, evidence_file_id, entered_by_role";

/** Returns [] (instead of throwing) if migration 0059 hasn't been applied yet,
 *  so the portals keep working before the table exists. */
export async function listLearnerEntries(institutionId: string, authUserId: string, studentId: string): Promise<LearnerEntry[]> {
  const db = await getDbClient();
  try {
    return await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const { rows } = await scoped.query<LearnerEntry>(
        `select ${COLS} from learner_record_entries where student_id = $1 order by entry_date desc, created_at desc`,
        [studentId]
      );
      return rows;
    });
  } catch (e) {
    if (String((e as { code?: string }).code) === "42P01" || /learner_record_entries/.test(String((e as Error).message))) return [];
    throw e;
  }
}

const createSchema = z.object({
  studentId: z.string().uuid(),
  section: z.enum(LEARNER_SECTIONS),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(2000).nullish(),
  value: z.string().trim().max(200).nullish(),
  level: z.string().trim().max(200).nullish(),
  period: z.string().trim().max(60).nullish(),
  hours: z.coerce.number().min(0).max(100000).nullish(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  evidenceFileId: z.string().uuid().nullish(),
});

export async function createLearnerEntry(
  institutionId: string, authUserId: string, userId: string,
  input: z.input<typeof createSchema>, enteredByRole: "staff" | "student"
): Promise<{ id: string }> {
  const d = createSchema.parse(input);
  if (enteredByRole === "student" && !SECTION_META[d.section].studentCanAdd) throw new Error("Students can only add reflections and goals.");
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into learner_record_entries
         (institution_id, student_id, section, title, detail, value, level, period, hours, entry_date, evidence_file_id, entered_by, entered_by_role)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, coalesce($10::date, current_date), $11,$12,$13)
       returning id`,
      [institutionId, d.studentId, d.section, d.title, d.detail || null, d.value || null, d.level || null,
       d.period || null, d.hours ?? null, d.entryDate ?? null, d.evidenceFileId ?? null, userId, enteredByRole]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "learner_record", entityType: "learner_record_entries", entityId: rows[0].id, after: { studentId: d.studentId, section: d.section } });
    return rows[0];
  });
}

export async function deleteLearnerEntry(
  institutionId: string, authUserId: string, userId: string, entryId: string, onlyOwnStudentId?: string
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `delete from learner_record_entries where id = $1 ${onlyOwnStudentId ? "and student_id = $2 and entered_by_role = 'student'" : ""} returning id`,
      onlyOwnStudentId ? [entryId, onlyOwnStudentId] : [entryId]
    );
    if (rows[0]) await recordAudit(scoped, { institutionId, userId, action: "delete", module: "learner_record", entityType: "learner_record_entries", entityId: entryId });
  });
}

/** Staff may enter a learner record if they hold student.edit, or teach the
 *  student's current class (same scoping rule as the rest of the teacher UI). */
export async function assertCanEditLearnerRecord(
  institutionId: string, authUserId: string, userId: string, permissions: Set<string>, studentId: string
): Promise<void> {
  if (can(permissions, "student.edit")) return;
  const [enrollment, scope] = await Promise.all([
    getCurrentEnrollment(institutionId, authUserId, studentId),
    getTeacherClassScope(institutionId, authUserId, userId),
  ]);
  if (enrollment && scope.classIds.has(enrollment.class_id)) return;
  throw new Error("You can only enter Learner Record details for students in a class you teach.");
}

export async function canEditLearnerRecord(
  institutionId: string, authUserId: string, userId: string, permissions: Set<string>, studentId: string
): Promise<boolean> {
  try { await assertCanEditLearnerRecord(institutionId, authUserId, userId, permissions, studentId); return true; } catch { return false; }
}
