/**
 * PROMPT EDU ERP — Report card remarks (migration 0065).
 *
 * §Report-card-remark ("class teacher should have an option for typing
 * report card remark"): one remark per student per examination, printed in
 * the "Class teacher's remarks" box of that examination's report card.
 *
 * Write access is decided HERE, not just by the page that shows the form:
 *   - `unrestricted` callers (admin / principal — the caller passes true
 *     for super admin, marks.approve or settings.manage) may write any
 *     student's remark;
 *   - everyone else may write only for students whose active enrolment in
 *     the examination's academic year falls in a class + division they hold
 *     a current-year `class_teacher` assignment for (a whole-class
 *     assignment, section_id null, covers every division).
 */
import { z } from "zod";
import { getDbClient, type DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { sortRoster } from "../../services/academic/roster-order";

export const REPORT_CARD_REMARK_MAX = 1000;

/** The class/divisions this user is class teacher of this academic year. */
export interface ClassTeacherCoverage {
  /** class_id -> null (every division) or the set of section_ids. */
  byClass: Map<string, Set<string> | null>;
}

export function coverageIncludes(c: ClassTeacherCoverage, classId: string, sectionId: string | null): boolean {
  if (!c.byClass.has(classId)) return false;
  const sections = c.byClass.get(classId);
  return sections == null || (sectionId != null && sections.has(sectionId));
}

async function loadCoverage(scoped: DbClient, teacherUserId: string): Promise<ClassTeacherCoverage> {
  const { rows } = await scoped.query<{ class_id: string; section_id: string | null }>(
    `select ta.class_id, ta.section_id
       from teacher_assignments ta
       join academic_years ay on ay.id = ta.academic_year_id
      where ta.user_id = $1 and ta.role_type = 'class_teacher' and ay.is_current = true
        and ta.class_id is not null`,
    [teacherUserId]
  );
  const byClass = new Map<string, Set<string> | null>();
  for (const r of rows) {
    if (r.section_id == null) { byClass.set(r.class_id, null); continue; }
    const cur = byClass.get(r.class_id);
    if (cur === null) continue; // already whole-class
    const set = cur ?? new Set<string>();
    set.add(r.section_id);
    byClass.set(r.class_id, set);
  }
  return { byClass };
}

export async function getClassTeacherCoverage(
  institutionId: string, authUserId: string, teacherUserId: string
): Promise<ClassTeacherCoverage> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, (scoped) => loadCoverage(scoped, teacherUserId));
}

/** studentId -> remark for one examination (optionally only these students). */
export async function getReportCardRemarks(
  institutionId: string, authUserId: string, examinationId: string, studentIds?: string[] | null
): Promise<Map<string, string>> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ student_id: string; remark: string }>(
      `select student_id, remark from report_card_remarks
        where examination_id = $1 and ($2::uuid[] is null or student_id = any($2::uuid[]))`,
      [examinationId, studentIds ?? null]
    );
    return new Map(rows.map((r) => [r.student_id, r.remark]));
  });
}

export interface RemarkRosterRow {
  student_id: string; full_name: string; admission_number: string;
  roll_number: number | null; gender: string | null;
  class_id: string; class_name: string; section_id: string; section_name: string;
  remark: string | null;
}

/** Students actively enrolled, in the examination's academic year, in one
 *  class (optionally one division), in roster order, with any remark
 *  already saved. Withdrawn students are left out. */
export async function listRemarkRoster(
  institutionId: string, authUserId: string, examinationId: string, classId: string, sectionId?: string | null
): Promise<RemarkRosterRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<RemarkRosterRow>(
      `select s.id as student_id, s.full_name, s.admission_number, se.roll_number, s.gender,
              c.id as class_id, c.name as class_name, sec.id as section_id, sec.name as section_name,
              rcr.remark
         from examinations e
         join student_enrollments se on se.academic_year_id = e.academic_year_id and se.status = 'active'
         join students s on s.id = se.student_id and s.status <> 'withdrawn'
         join classes c on c.id = se.class_id
         join sections sec on sec.id = se.section_id
         left join report_card_remarks rcr on rcr.examination_id = e.id and rcr.student_id = s.id
        where e.id = $1 and se.class_id = $2 and ($3::uuid is null or se.section_id = $3::uuid)`,
      [examinationId, classId, sectionId || null]
    );
    return sortRoster(rows);
  });
}

const saveSchema = z.object({
  examinationId: z.string().uuid(),
  entries: z.array(z.object({
    studentId: z.string().uuid(),
    remark: z.string().max(REPORT_CARD_REMARK_MAX, `A remark can be at most ${REPORT_CARD_REMARK_MAX} characters.`),
  })).max(500),
});

/** Saves a batch of remarks for one examination. A blank remark clears the
 *  student's row. Returns how many rows were written or cleared. */
export async function saveReportCardRemarks(
  institutionId: string, authUserId: string, userId: string,
  input: z.infer<typeof saveSchema>,
  opts: { unrestricted: boolean }
): Promise<{ saved: number; cleared: number }> {
  const data = saveSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: exam } = await scoped.query<{ academic_year_id: string }>(
      "select academic_year_id from examinations where id = $1", [data.examinationId]
    );
    if (!exam[0]) throw new Error("Examination not found.");
    if (data.entries.length === 0) return { saved: 0, cleared: 0 };

    const studentIds = data.entries.map((e) => e.studentId);
    const { rows: enrol } = await scoped.query<{ student_id: string; class_id: string; section_id: string }>(
      `select student_id, class_id, section_id from student_enrollments
        where academic_year_id = $1 and status = 'active' and student_id = any($2::uuid[])`,
      [exam[0].academic_year_id, studentIds]
    );
    const enrolByStudent = new Map(enrol.map((r) => [r.student_id, r]));
    const missing = studentIds.filter((id) => !enrolByStudent.has(id));
    if (missing.length > 0) throw new Error("Some students are not enrolled in this examination's academic year.");

    if (!opts.unrestricted) {
      const coverage = await loadCoverage(scoped, userId);
      const outside = enrol.filter((r) => !coverageIncludes(coverage, r.class_id, r.section_id));
      if (outside.length > 0) throw new Error("Only the class teacher of a class can write its report card remarks.");
    }

    let saved = 0, cleared = 0;
    for (const e of data.entries) {
      const remark = e.remark.trim();
      if (remark === "") {
        const { rows: gone } = await scoped.query(
          "delete from report_card_remarks where examination_id = $1 and student_id = $2 returning id", [data.examinationId, e.studentId]
        );
        cleared += gone.length;
      } else {
        await scoped.query(
          `insert into report_card_remarks (institution_id, examination_id, student_id, remark, set_by)
           values ($1, $2, $3, $4, $5)
           on conflict (examination_id, student_id) do update set
             remark = excluded.remark, set_by = excluded.set_by, updated_at = now()
           where report_card_remarks.remark is distinct from excluded.remark`,
          [institutionId, data.examinationId, e.studentId, remark, userId]
        );
        saved += 1;
      }
    }
    await recordAudit(scoped, {
      institutionId, userId, action: "upsert", module: "examination",
      entityType: "report_card_remarks", entityId: data.examinationId,
      after: { students: data.entries.length, saved, cleared },
    });
    return { saved, cleared };
  });
}
