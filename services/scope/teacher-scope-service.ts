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
import { can } from "../permissions/permission-service";
import { getExamSubjectRef, getExamSubjectClassIds } from "../../modules/examination/service";

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
  /** Classes where this teacher holds a class_teacher-role assignment (any
   *  section) — §"if subject teacher is not available, give mark entry
   *  power to class teachers": this is the set that fallback applies to,
   *  distinct from classIds (which also includes classes reached only via
   *  a subject_teacher row). */
  classIdsAsClassTeacher: Set<string>;
  /** classId -> set of subject_ids that ALREADY have a dedicated
   *  subject_teacher assigned, institution-wide, this academic year —
   *  regardless of who holds it. Populated only for the classes this
   *  teacher is a class_teacher of (classIdsAsClassTeacher), since that's
   *  the only place the fallback below ever consults it. */
  dedicatedSubjectsByClass: Map<string, Set<string>>;
}

const EMPTY_SCOPE: TeacherClassScope = {
  classIds: new Set(),
  sectionIds: new Set(),
  classIdsWithAllSections: new Set(),
  subjectIdsByClass: new Map(),
  classIdsAsClassTeacher: new Set(),
  dedicatedSubjectsByClass: new Map(),
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
    const { rows } = await scoped.query<{ class_id: string; section_id: string | null; subject_id: string | null; role_type: string }>(
      `select ta.class_id, ta.section_id, ta.subject_id, ta.role_type
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
    const classIdsAsClassTeacher = new Set<string>();

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
      if (r.role_type === "class_teacher") classIdsAsClassTeacher.add(r.class_id);
    }

    // §"if subject teacher is not available, give mark entry power to
    // class teachers": institution-wide, current-year lookup of which
    // subjects ALREADY have a dedicated subject_teacher in each class this
    // person is a class_teacher of -- so scopeIncludesSubjectInClass()
    // below can tell "nobody teaches this subject specifically" (fallback
    // applies) apart from "someone else already does" (fallback must NOT
    // override that person's exclusive assignment). Scoped to just those
    // classes, not the whole institution, to keep this cheap.
    const dedicatedSubjectsByClass = new Map<string, Set<string>>();
    if (classIdsAsClassTeacher.size > 0) {
      const { rows: dedicatedRows } = await scoped.query<{ class_id: string; subject_id: string }>(
        `select distinct ta2.class_id, ta2.subject_id
           from teacher_assignments ta2
           join academic_years ay2 on ay2.id = ta2.academic_year_id
          where ay2.is_current = true and ta2.subject_id is not null
            and ta2.class_id = any($1::uuid[])`,
        [Array.from(classIdsAsClassTeacher)]
      );
      for (const r of dedicatedRows) {
        const set = dedicatedSubjectsByClass.get(r.class_id) ?? new Set<string>();
        set.add(r.subject_id);
        dedicatedSubjectsByClass.set(r.class_id, set);
      }
    }

    return { classIds, sectionIds, classIdsWithAllSections, subjectIdsByClass, classIdsAsClassTeacher, dedicatedSubjectsByClass };
  });
}

/** True if `sectionId` (belonging to `classId`) is visible to this scope —
 *  either explicitly assigned, or the teacher has a whole-class assignment
 *  for `classId`. */
export function scopeIncludesSection(scope: TeacherClassScope, classId: string, sectionId: string): boolean {
  return scope.classIdsWithAllSections.has(classId) || scope.sectionIds.has(sectionId);
}

/** True if this teacher may act on `subjectId` in `classId` — used to gate
 *  marks entry access, which is always for one exam_subject (= one subject)
 *  at a time.
 *
 *  §"mark entry page 404" root cause: MMP's (and most madrasa-style
 *  institutions') teacher_assignments are 100% class_teacher rows with
 *  subject_id = null — one teacher runs the whole class, every subject,
 *  with no separate subject_teacher rows ever created. The original rule
 *  here ("only a subject_teacher row authorizes a subject") silently
 *  authorized ZERO subjects for every such teacher the moment the CS.2
 *  scoping fix shipped, which is why the dashboard's new Mark Entry widget
 *  came up empty/404 for them — not a routing bug, a scope bug.
 *
 *  analytics/service's own scopedBySubject filter (app/(institution)/
 *  analytics/page.tsx) already reasoned about this correctly: when a
 *  teacher has recorded NO subject_teacher rows at all for a class, that
 *  means "no subject-level restriction was ever set up for them there", so
 *  they're treated as authorized for every subject in that class. This
 *  makes that same rule the shared one, instead of two independently
 *  inconsistent copies: a subject_teacher row for a class narrows access to
 *  just those subjects; its total absence (pure class_teacher assignment)
 *  leaves the whole class open, since that's the only way this teacher's
 *  scope can ever act on it.
 *
 *  §"if subject teacher is not available, give mark entry power to class
 *  teachers": a second, narrower fallback -- a class_teacher of `classId`
 *  who ALSO holds one or more subject_teacher rows there (so the branch
 *  above doesn't apply) still gets access to any OTHER subject in that
 *  class for which nobody, institution-wide, holds a dedicated
 *  subject_teacher assignment this year. A subject that already has its
 *  own assigned teacher (even if it isn't this person) is never overridden
 *  by this fallback -- see dedicatedSubjectsByClass's doc comment. */
export function scopeIncludesSubjectInClass(scope: TeacherClassScope, classId: string, subjectId: string): boolean {
  const allowedSubjects = scope.subjectIdsByClass.get(classId);
  if (!allowedSubjects || allowedSubjects.size === 0) {
    if (scope.classIds.has(classId)) return true;
  } else if (allowedSubjects.has(subjectId)) {
    return true;
  }
  if (scope.classIdsAsClassTeacher.has(classId)) {
    const dedicated = scope.dedicatedSubjectsByClass.get(classId);
    if (!dedicated || !dedicated.has(subjectId)) return true;
  }
  return false;
}


/** §CS.2 "teachers should have mark entry to their respective class
 *  only" -- the marks-entry PAGE (app/(institution)/examinations/[id]/
 *  marks/[examSubjectId]/page.tsx) already gated on this exact scope, but
 *  only there: the server actions that actually write marks (saveMarksAction,
 *  deleteMarkAction, correctMarkAction, and the shared submit/verify/
 *  approve/lock transitionAction, all in
 *  app/(institution)/examinations/actions.ts) took no scope into account at
 *  all -- only the blanket marks.enter/marks.verify/etc. permission, which
 *  every teacher holds institution-wide. That meant a teacher blocked from
 *  even *seeing* another class's grid could still POST a save/submit/delete
 *  directly at its examSubjectId. This is the single shared check both the
 *  page and every mark-writing action now call, so the rule lives in one
 *  place instead of two independently-maintained copies.
 *
 *  marks.approve remains the "unrestricted, sees/acts on everything"
 *  signal (matches every other use of it in this module) -- callers that
 *  hold it skip the scope check entirely. Throws (rather than returning a
 *  boolean) so a server action can just await it before proceeding, the
 *  same way requirePermission() already works. */
export async function assertMarkEntryScope(
  institutionId: string, authUserId: string, userId: string, permissions: Set<string>, examSubjectId: string
): Promise<void> {
  if (can(permissions, "marks.approve")) return;
  const ref = await getExamSubjectRef(institutionId, authUserId, examSubjectId);
  if (!ref) throw new Error("Exam subject not found.");
  const [scope, coveredClassIds] = await Promise.all([
    getTeacherClassScope(institutionId, authUserId, userId),
    // Migration 0056: only grades this exam_subject is actually set for,
    // not every grade in the exam's scope.
    getExamSubjectClassIds(institutionId, authUserId, examSubjectId),
  ]);
  const authorized = coveredClassIds.some((classId) => scopeIncludesSubjectInClass(scope, classId, ref.subjectId));
  if (!authorized) throw new Error("You can only enter marks for a class/subject you're assigned to teach.");
}

/** §CS.2 companion for Daily Assessment (createDailyAssessmentAction,
 *  updateDailyAssessmentAction, deleteDailyAssessmentAction,
 *  saveDailyAssessmentMarksAction in actions.ts) -- same rule, but a daily
 *  assessment session already carries its own single (classId, subjectId)
 *  directly (no exam_subject indirection like the standard exam flow), so
 *  the caller passes those straight through instead of an examSubjectId. */
export async function assertDailyAssessmentScope(
  institutionId: string, authUserId: string, userId: string, permissions: Set<string>, classId: string, subjectId: string
): Promise<void> {
  if (can(permissions, "marks.approve")) return;
  const scope = await getTeacherClassScope(institutionId, authUserId, userId);
  if (!scopeIncludesSubjectInClass(scope, classId, subjectId)) {
    throw new Error("You can only manage daily assessments for a class/subject you're assigned to teach.");
  }
}
