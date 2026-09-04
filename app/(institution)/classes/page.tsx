import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listStudentsForAdmin } from "../../../modules/students/service";
import { listTeacherAssignments } from "../../../modules/staff/service";
import { getTeacherClassScope } from "../../../services/scope/teacher-scope-service";

/**
 * §137 follow-up ("in the side panel, there should [be] Classes for
 * institutions; where class details, student, class teacher, attendance
 * all other concerned details will be available there") — a single
 * overview hub pulling together data that previously only existed
 * scattered across /academic (class/section names only), /students
 * (roster, filterable by class), /staff (teacher_assignments), and
 * /attendance (grid, filterable by class+section). Deliberately a READ
 * overview with deep links out to those existing pages for the actual
 * edit actions, rather than re-implementing every one of those forms
 * again here — see [classId]/page.tsx for the per-class drill-down.
 *
 * "A, B, C, D are divisions, section is like LP, UP, HS, HSS" — the
 * `sections` table (migration 0001) is labelled "Division" throughout
 * this hub instead of "Section" to match that vocabulary. LP/UP/HS/HSS
 * grouping is now a real, admin-editable `classes.stage` field (migration
 * 0032, set per class in Academic Setup) rather than a numeric-name guess —
 * that guess broke for non-numeric class names (LKG, UKG, madrasa grade
 * names). A class with no stage set falls into "Other".
 */
export default async function ClassesPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  // "Teachers can give access only to their respective classes" follow-up —
  // mirrors students/page.tsx's scoping (this hub shows the same roster).
  const canViewAll = can(ctx.permissions, "student.view_all");
  const scopeClassIds = canViewAll
    ? undefined
    : Array.from((await getTeacherClassScope(institutionId, authUserId, ctx.userId)).classIds);

  const [allClasses, allSections, students, teacherAssignments] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listStudentsForAdmin(institutionId, authUserId, { classIds: scopeClassIds }),
    listTeacherAssignments(institutionId, authUserId),
  ]);
  const classes = scopeClassIds ? allClasses.filter((c) => scopeClassIds.includes(c.id)) : allClasses;
  const sections = scopeClassIds ? allSections.filter((s) => scopeClassIds.includes(s.class_id)) : allSections;

  const sectionsByClass = new Map<string, typeof sections>();
  for (const s of sections) {
    const arr = sectionsByClass.get(s.class_id) ?? [];
    arr.push(s);
    sectionsByClass.set(s.class_id, arr);
  }

  // §Classes-hub follow-up ("class details should be like Class 11 A,
  // Class 11 B... then number of students, then name of class teacher
  // without division in bracket") — one card per DIVISION rather than one
  // card per class lumping every division's count/teacher together, so
  // each of these needs to be tracked per class+division, not just per
  // class.
  const studentCountByClass = new Map<string, number>(); // fallback for a class with no divisions yet
  const studentCountByClassSection = new Map<string, number>(); // key: `${classId}::${sectionName}`
  for (const s of students) {
    if (!s.class_id) continue;
    studentCountByClass.set(s.class_id, (studentCountByClass.get(s.class_id) ?? 0) + 1);
    if (s.section_name) {
      const key = `${s.class_id}::${s.section_name}`;
      studentCountByClassSection.set(key, (studentCountByClassSection.get(key) ?? 0) + 1);
    }
  }
  // Division-specific class teacher (section_id set) takes precedence;
  // a class-wide assignment (section_id null, one teacher for the whole
  // class) applies to every division that has no more specific one.
  const classTeacherByClassSection = new Map<string, string>(); // key: `${classId}::${sectionId}`
  const classTeacherByClassWide = new Map<string, string>(); // key: classId
  const classTeacherByClass = new Map<string, string>(); // fallback for a class with no divisions yet
  for (const a of teacherAssignments) {
    if (a.role_type !== "class_teacher") continue;
    if (a.section_id) {
      classTeacherByClassSection.set(`${a.class_id}::${a.section_id}`, a.teacher_name);
    } else {
      classTeacherByClassWide.set(a.class_id, a.teacher_name);
    }
    classTeacherByClass.set(a.class_id, a.teacher_name);
  }

  const groups = new Map<string, typeof classes>();
  for (const c of classes) {
    const phase = c.stage?.trim() || "Other";
    const arr = groups.get(phase) ?? [];
    arr.push(c);
    groups.set(phase, arr);
  }
  // `classes` came from listClasses(), already in the canonical section
  // (KG/LP/UP/HS/HSS/GRADUATION/POST GRADUATION) -> GRADE order
  // (§users-roles follow-up "order MUST BE FOLLOWED EVERYWHERE"), so a
  // Map built by iterating it in order already groups phases correctly --
  // no separate knownOrder list to keep in sync with STAGE_ORDER.
  const orderedPhases = Array.from(groups.keys());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Classes</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Every class, its divisions, assigned class teacher, and student count in one place.
        </p>
      </div>

      {classes.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No classes yet — add some under <Link href="/academic" className="underline">Academic Setup</Link>.
        </p>
      ) : (
        orderedPhases.map((phase) => (
          <section key={phase} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{phase}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.get(phase)!.flatMap((c) => {
                const classSections = [...(sectionsByClass.get(c.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name));

                if (classSections.length === 0) {
                  // No divisions created yet — a single card for the class
                  // itself, same as before.
                  const teacher = classTeacherByClass.get(c.id) ?? null;
                  return [
                    <Link
                      key={c.id}
                      href={`/classes/${c.id}`}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                    >
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">Class {c.name}</div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {studentCountByClass.get(c.id) ?? 0} student{(studentCountByClass.get(c.id) ?? 0) === 1 ? "" : "s"}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {teacher ? `Class teacher: ${teacher}` : "No class teacher assigned"}
                      </div>
                    </Link>,
                  ];
                }

                // One card per division — "Class 11 A", "Class 11 B", etc.
                return classSections.map((sec) => {
                  const studentCount = studentCountByClassSection.get(`${c.id}::${sec.name}`) ?? 0;
                  const teacher = classTeacherByClassSection.get(`${c.id}::${sec.id}`) ?? classTeacherByClassWide.get(c.id) ?? null;
                  return (
                    <Link
                      key={sec.id}
                      href={`/classes/${c.id}`}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                    >
                      <div className="font-medium text-zinc-900 dark:text-zinc-50">Class {c.name} {sec.name}</div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {studentCount} student{studentCount === 1 ? "" : "s"}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {teacher ? `Class teacher: ${teacher}` : "No class teacher assigned"}
                      </div>
                    </Link>
                  );
                });
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
