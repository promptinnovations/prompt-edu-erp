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
 * this hub instead of "Section" to match that vocabulary; LP/UP/HS/HSS is
 * a purely presentational grouping of numeric class names (the standard
 * Kerala convention: LP 1–4, UP 5–7, HS 8–10, HSS 11–12), computed here,
 * not a stored column — a class named anything else falls into "Other"
 * rather than forcing every institution into this one scheme.
 */
function phaseForClass(className: string): string {
  const n = Number(className.trim());
  if (!Number.isInteger(n)) return "Other";
  if (n >= 1 && n <= 4) return "LP (Lower Primary)";
  if (n >= 5 && n <= 7) return "UP (Upper Primary)";
  if (n >= 8 && n <= 10) return "HS (High School)";
  if (n >= 11 && n <= 12) return "HSS (Higher Secondary)";
  return "Other";
}

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
  const studentCountByClass = new Map<string, number>();
  for (const s of students) {
    if (!s.class_id) continue;
    studentCountByClass.set(s.class_id, (studentCountByClass.get(s.class_id) ?? 0) + 1);
  }
  const classTeachersByClass = new Map<string, string[]>();
  for (const a of teacherAssignments) {
    if (a.role_type !== "class_teacher") continue;
    const arr = classTeachersByClass.get(a.class_id) ?? [];
    arr.push(a.section_name ? `${a.teacher_name} (Div. ${a.section_name})` : a.teacher_name);
    classTeachersByClass.set(a.class_id, arr);
  }

  const groups = new Map<string, typeof classes>();
  for (const c of classes) {
    const phase = phaseForClass(c.name);
    const arr = groups.get(phase) ?? [];
    arr.push(c);
    groups.set(phase, arr);
  }
  const phaseOrder = ["LP (Lower Primary)", "UP (Upper Primary)", "HS (High School)", "HSS (Higher Secondary)", "Other"];
  const orderedPhases = phaseOrder.filter((p) => groups.has(p));

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
              {groups.get(phase)!.map((c) => {
                const classSections = sectionsByClass.get(c.id) ?? [];
                const teachers = classTeachersByClass.get(c.id) ?? [];
                return (
                  <Link
                    key={c.id}
                    href={`/classes/${c.id}`}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                  >
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">Class {c.name}</div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {classSections.length} division{classSections.length === 1 ? "" : "s"} ({classSections.map((s) => s.name).join(", ") || "none yet"})
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {studentCountByClass.get(c.id) ?? 0} student{(studentCountByClass.get(c.id) ?? 0) === 1 ? "" : "s"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {teachers.length > 0 ? `Class teacher: ${teachers.join(", ")}` : "No class teacher assigned"}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
