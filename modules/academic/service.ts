/**
 * PROMPT EDU ERP — Academic module service (classes, sections, subjects).
 * ARCHITECTURE.md §G "module is a self-contained domain package" / §D.3.
 *
 * Every function requires an explicit institutionId (no query is ever run
 * without one) and runs through db.withInstitutionContext, so both RLS
 * (§E Gate 2) and this institutionId (§E Gate 1) must agree, or the RLS
 * layer independently blocks the row regardless of any bug here.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export interface ClassRecord {
  id: string;
  name: string;
  sort_order: number;
  academic_stream: string | null;
}
export interface SectionRecord {
  id: string;
  class_id: string;
  name: string;
  capacity: number | null;
}
export interface SubjectRecord {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
}

const createClassSchema = z.object({
  name: z.string().min(1).max(100), // Unicode-safe — any script, no Latin assumption (§S.3)
  sortOrder: z.number().int().default(0),
  academicStream: z.string().max(100).nullable().optional(),
});

export async function listClasses(institutionId: string, authUserId: string): Promise<ClassRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ClassRecord>(
      "select id, name, sort_order, academic_stream from classes order by sort_order, name"
    );
    return rows;
  });
}

export async function createClass(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createClassSchema>,
  scopedClient?: DbClient // §Q.1: passed by bulk import's confirmImport() so every
                           // row in a batch commits inside ONE transaction rather
                           // than each insert opening its own (see modules/bulk/service.ts)
): Promise<ClassRecord> {
  const data = createClassSchema.parse(input); // server-side validation, independent of client (§X.2)
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<ClassRecord>(
      `insert into classes (institution_id, name, sort_order, academic_stream)
       values ($1, $2, $3, $4) returning id, name, sort_order, academic_stream`,
      [institutionId, data.name, data.sortOrder, data.academicStream ?? null]
    );
    await recordAudit(scoped, {
      institutionId,
      userId,
      action: "create",
      module: "academic",
      entityType: "classes",
      entityId: rows[0].id,
      after: rows[0],
    });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

const updateClassSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  academicStream: z.string().max(100).nullable().optional(),
});

export async function updateClass(
  institutionId: string, authUserId: string, userId: string, classId: string, input: z.infer<typeof updateClassSchema>
): Promise<ClassRecord | null> {
  const data = updateClassSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ClassRecord>(
      `update classes set
         name = coalesce($1, name),
         sort_order = coalesce($2, sort_order),
         academic_stream = case when $3 then $4 else academic_stream end
       where id = $5
       returning id, name, sort_order, academic_stream`,
      [data.name ?? null, data.sortOrder ?? null, "academicStream" in data, data.academicStream ?? null, classId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "academic", entityType: "classes", entityId: classId, after: rows[0] });
    return rows[0];
  });
}

/** Hard-deletes a class (§137 follow-up "should be able ... delete"). Every
 *  FK that references classes.id (sections, class_subjects,
 *  teacher_assignments, student_enrollments, exam_classes) cascades — see
 *  0001_foundation.sql — EXCEPT attendance_records and portion_plans, which
 *  have no ON DELETE clause and so block the delete at the database level
 *  (Postgres default NO ACTION) once real attendance/portion data exists.
 *  The explicit enrolled-students guard below gives a clear, actionable
 *  error for the single most common blocker (an admin trying to delete a
 *  class students are still actively enrolled in) before ever reaching that
 *  harder-to-read foreign-key-violation case. */
export async function deleteClass(institutionId: string, authUserId: string, userId: string, classId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: enrolled } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from student_enrollments where class_id = $1 and status = 'active'",
      [classId]
    );
    if (Number(enrolled[0]?.count ?? 0) > 0) {
      throw new Error("This class still has actively enrolled students — move or remove them first.");
    }
    let deleted;
    try {
      deleted = await scoped.query<{ id: string; name: string }>("delete from classes where id = $1 returning id, name", [classId]);
    } catch {
      throw new Error("This class can't be deleted yet — it's still referenced by attendance or syllabus records.");
    }
    if (deleted.rows.length === 0) return;
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "academic", entityType: "classes", entityId: classId, before: deleted.rows[0] });
  });
}

const createSectionSchema = z.object({
  classId: z.string().uuid(),
  name: z.string().min(1).max(50),
  capacity: z.number().int().positive().nullable().optional(),
});

export async function listSections(institutionId: string, authUserId: string, classId?: string): Promise<SectionRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SectionRecord>(
      classId
        ? "select id, class_id, name, capacity from sections where class_id = $1 order by name"
        : "select id, class_id, name, capacity from sections order by name",
      classId ? [classId] : []
    );
    return rows;
  });
}

export async function createSection(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createSectionSchema>,
  scopedClient?: DbClient // §Q.1, see createClass() above
): Promise<SectionRecord> {
  const data = createSectionSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<SectionRecord>(
      `insert into sections (institution_id, class_id, name, capacity)
       values ($1, $2, $3, $4) returning id, class_id, name, capacity`,
      [institutionId, data.classId, data.name, data.capacity ?? null]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "academic",
      entityType: "sections", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

const updateSectionSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  capacity: z.number().int().positive().nullable().optional(),
});

export async function updateSection(
  institutionId: string, authUserId: string, userId: string, sectionId: string, input: z.infer<typeof updateSectionSchema>
): Promise<SectionRecord | null> {
  const data = updateSectionSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SectionRecord>(
      `update sections set
         name = coalesce($1, name),
         capacity = case when $2 then $3 else capacity end
       where id = $4
       returning id, class_id, name, capacity`,
      [data.name ?? null, "capacity" in data, data.capacity ?? null, sectionId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "academic", entityType: "sections", entityId: sectionId, after: rows[0] });
    return rows[0];
  });
}

/** Same enrolled-students guard as deleteClass() above, scoped to just this section. */
export async function deleteSection(institutionId: string, authUserId: string, userId: string, sectionId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: enrolled } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from student_enrollments where section_id = $1 and status = 'active'",
      [sectionId]
    );
    if (Number(enrolled[0]?.count ?? 0) > 0) {
      throw new Error("This section still has actively enrolled students — move or remove them first.");
    }
    let deleted;
    try {
      deleted = await scoped.query<{ id: string; name: string }>("delete from sections where id = $1 returning id, name", [sectionId]);
    } catch {
      throw new Error("This section can't be deleted yet — it's still referenced by attendance or syllabus records.");
    }
    if (deleted.rows.length === 0) return;
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "academic", entityType: "sections", entityId: sectionId, before: deleted.rows[0] });
  });
}

const createSubjectSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().max(30).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
});

export async function listSubjects(institutionId: string, authUserId: string): Promise<SubjectRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SubjectRecord>(
      "select id, name, code, category from subjects order by name"
    );
    return rows;
  });
}

export async function createSubject(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createSubjectSchema>,
  scopedClient?: DbClient // §Q.1, see createClass() above
): Promise<SubjectRecord> {
  const data = createSubjectSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<SubjectRecord>(
      `insert into subjects (institution_id, name, code, category)
       values ($1, $2, $3, $4) returning id, name, code, category`,
      [institutionId, data.name, data.code ?? null, data.category ?? null]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "academic",
      entityType: "subjects", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

// -----------------------------------------------------------------------------
// Class ↔ subject links (class_subjects). Populated automatically by
// super-admin-service.ts's provisionSksvbDefaults() for SKSVB madrasas, but
// until now had no read function or UI for ANY institution — the table sat
// completely unused by the app layer (§137 follow-up "subjects should be
// visible in classes as well"). listClassSubjects() + the two mutators below
// are the general-purpose version every institution (SKSVB or not) can use.
// -----------------------------------------------------------------------------

export interface ClassSubjectRecord {
  id: string;
  class_id: string;
  subject_id: string;
  subject_name: string;
  is_core: boolean;
}

export async function listClassSubjects(institutionId: string, authUserId: string, classId?: string): Promise<ClassSubjectRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ClassSubjectRecord>(
      classId
        ? `select cs.id, cs.class_id, cs.subject_id, s.name as subject_name, cs.is_core
             from class_subjects cs join subjects s on s.id = cs.subject_id
            where cs.class_id = $1
            order by s.name`
        : `select cs.id, cs.class_id, cs.subject_id, s.name as subject_name, cs.is_core
             from class_subjects cs join subjects s on s.id = cs.subject_id
            order by s.name`,
      classId ? [classId] : []
    );
    return rows;
  });
}

const assignClassSubjectSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  isCore: z.boolean().default(true),
});

/** Idempotent by design (`on conflict ... do update`) — safe to call again
 *  to change is_core without a separate update function. */
export async function assignSubjectToClass(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof assignClassSubjectSchema>
): Promise<ClassSubjectRecord> {
  const data = assignClassSubjectSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; class_id: string; subject_id: string; is_core: boolean }>(
      `insert into class_subjects (institution_id, class_id, subject_id, is_core)
       values ($1, $2, $3, $4)
       on conflict (institution_id, class_id, subject_id) do update set is_core = excluded.is_core
       returning id, class_id, subject_id, is_core`,
      [institutionId, data.classId, data.subjectId, data.isCore]
    );
    const { rows: subjRows } = await scoped.query<{ name: string }>("select name from subjects where id = $1", [data.subjectId]);
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "academic",
      entityType: "class_subjects", entityId: rows[0].id, after: rows[0],
    });
    return { ...rows[0], subject_name: subjRows[0]?.name ?? "" };
  });
}

export async function removeSubjectFromClass(
  institutionId: string, authUserId: string, userId: string, classId: string, subjectId: string
): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: deleted } = await scoped.query<{ id: string }>(
      "delete from class_subjects where class_id = $1 and subject_id = $2 returning id",
      [classId, subjectId]
    );
    if (deleted.length === 0) return;
    await recordAudit(scoped, {
      institutionId, userId, action: "delete", module: "academic",
      entityType: "class_subjects", entityId: deleted[0].id,
    });
  });
}

// -----------------------------------------------------------------------------
// Academic years / terms (§D.3) — examinations, enrollments, and attendance
// all key off academic_year_id, so these are foundational to Phase 3+.
// -----------------------------------------------------------------------------

export interface AcademicYearRecord {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}
export interface TermRecord {
  id: string;
  academic_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
}

const createAcademicYearSchema = z.object({
  name: z.string().min(1).max(50), // e.g. "2026-2027"
  startDate: z.string(), // ISO date
  endDate: z.string(),
  isCurrent: z.boolean().default(false),
});

export async function listAcademicYears(institutionId: string, authUserId: string): Promise<AcademicYearRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AcademicYearRecord>(
      "select id, name, start_date, end_date, is_current from academic_years order by start_date desc"
    );
    return rows;
  });
}

export async function getCurrentAcademicYear(institutionId: string, authUserId: string): Promise<AcademicYearRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AcademicYearRecord>(
      "select id, name, start_date, end_date, is_current from academic_years where is_current = true limit 1"
    );
    return rows[0] ?? null;
  });
}

export async function createAcademicYear(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createAcademicYearSchema>
): Promise<AcademicYearRecord> {
  const data = createAcademicYearSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    if (data.isCurrent) {
      // Only one "current" academic year per institution — data-driven, not
      // a special code path per institution (§2).
      await scoped.query("update academic_years set is_current = false where is_current = true");
    }
    const { rows } = await scoped.query<AcademicYearRecord>(
      `insert into academic_years (institution_id, name, start_date, end_date, is_current)
       values ($1, $2, $3, $4, $5)
       returning id, name, start_date, end_date, is_current`,
      [institutionId, data.name, data.startDate, data.endDate, data.isCurrent]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "academic",
      entityType: "academic_years", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  });
}

export async function listTerms(institutionId: string, authUserId: string, academicYearId?: string): Promise<TermRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<TermRecord>(
      academicYearId
        ? "select id, academic_year_id, name, start_date, end_date from terms where academic_year_id = $1 order by start_date"
        : "select id, academic_year_id, name, start_date, end_date from terms order by start_date",
      academicYearId ? [academicYearId] : []
    );
    return rows;
  });
}

