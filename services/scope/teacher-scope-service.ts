/**
 * PROMPT EDU ERP — shared "teacher class scope" helper.
 *
 * Follow-up to §137-era work: "teachers can give access only to their
 * respective classes" — a teacher holding only the narrow, per-module
 * permission (student.view, attendance.enter, marks.enter, …) rather than
 * its institution-wide counterpart (student.view_all, attendance.edit,
 * marks.approve, …) should only see/act on the classes they are actually
 * assigned to teach, not every class in the institution.
 *
 * Built directly on the EXISTING `teacher_assignments` table (migration
 * 0001) and its `modules/staff/service.ts` read helpers — no new schema.
 * Each row is either:
 *   - a `class_teacher` assignment: (class_id, section_id) — one specific
 *     section, OR (class_id, section_id = null) — the whole class, every
 *     section (this DOES happen — see createTeacherAssignment()'s schema,
 *     section_id is nullable/optional).
 *   - a `subject_teacher` assignment: same shape, plus a subject_id — the
 *     teacher only teaches that one subject in that class/section.
 *
 * Callers decide for themselves, per module, whether a given caller needs
 * scoping at all — this helper only answers "which classes/sections/
 * subjects is this person assigned to teach", it does not itself check
 * permissions. See callers (students/attendance/examinations pages) for the
 * "unrestricted" permission check that gates whether scoping is applied.
 */
import { getDbClient } from "../db/client";

export interface TeacherClassScope {
  /** Every class this teacher has at least one assignment in (as class
   *  teacher or subject teacher), regardless of section. */
  classIds: Set<string>;
  /** Specific sections explicitly named in an assignment. */
  sectionIds: Set<string>;
  /** Classes where at least one assignment has section_id = null — i.e. the
   *  assignment covers every section of that class, not just one. */
  classIdsWithAllSections: Set<string>;
  /** classId -> set of subject_ids this teacher teaches there (from
   *  subject_teacher rows only — class_teacher rows don't imply a subject). */
  subjectIdsByClass: Map<string, Set<string>>;
}

const EMPTY_SCOPE: TeacherClassScope = {
  classIds: new Set(),
  sectionIds: new Set(),
  classIdsWithAllSections: new Set(),
  subjectIdsByClass: new Map(),
};

/** Resolves `teacherUserId`'s (a `users.id`, NOT an auth_user_id — matches
 *  teacher_assignments.user_id) assigned classes/sections/subjects for the
 *  CURRENT academic year only — a past year's assignment shouldn't keep
 *  scoping someone into a class they no longer teach. */
export async function getTeacherClassScope(
  institutionId: string, authUserId: string, teacherUserId: string
): Promise<TeacherClassScope> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ class_id: string; section_id: string | null; subject_id: string | null }>(
      `select ta.class_id, ta.section_id, ta.subject_id
         from teacher_assignments ta
         join academic_years ay on ay.id = ta.academic_year_id
        where ta.user_id = $1 and ay.is_current = true`,
      [teacherUserId]
    );
    if (rows.length === 0) return EMPTY_SCOPE;

    const classIds = new Set<string>();
    const sectionIds = new Set<string>();
    const classIdsWithAllSections = new Set<string>();
    const subjectIdsByClass = new Map<string, Set<string>>();

    for (const r of rows) {
      classIds.add(r.class_id);
      if (r.section_id) {
        sectionIds.add(r.section_id);
      } else {
        classIdsWithAllSections.add(r.class_id);
      }
      if (r.subject_id) {
        const set = subjectIdsByClass.get(r.class_id) ?? new Set<string>();
        set.add(r.subject_id);
        subjectIdsByClass.set(r.class_id, set);
      }
    }
    return { classIds, sectionIds, classIdsWithAllSections, subjectIdsByClass };
  });
}

/** True if `sectionId` (belonging to `classId`) is visible to this scope —
 *  either explicitly assigned, or the teacher has a whole-class assignment
 *  for `classId`. */
export function scopeIncludesSection(scope: TeacherClassScope, classId: string, sectionId: string): boolean {
  return scope.classIdsWithAllSections.has(classId) || scope.sectionIds.has(sectionId);
}

/** True if this teacher teaches `subjectId` in `classId` specifically
 *  (subject_teacher assignment) — used to gate marks entry access, which is
 *  always for one exam_subject (= one subject) at a time. */
export function scopeIncludesSubjectInClass(scope: TeacherClassScope, classId: string, subjectId: string): boolean {
  return scope.subjectIdsByClass.get(classId)?.has(subjectId) ?? false;
}
