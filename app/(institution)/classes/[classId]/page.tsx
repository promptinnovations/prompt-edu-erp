import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { listClasses, listSections } from "../../../../modules/academic/service";
import { listStudentsForAdmin } from "../../../../modules/students/service";
import { listTeacherAssignments } from "../../../../modules/staff/service";

/**
 * §137 follow-up — the per-class drill-down: every division ("A, B, C, D
 * are divisions" — see classes/page.tsx's own header comment), its
 * assigned class teacher, and the day's attendance link, plus the full
 * class roster below. Today's attendance is a LINK into /attendance's
 * existing grid (already filterable by classId+sectionId+date, see that
 * page) rather than a duplicated grid here — one attendance-taking UI,
 * not two to keep in sync.
 */
export default async function ClassDetailPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const today = new Date().toISOString().slice(0, 10);

  const [classes, sections, students, teacherAssignments] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId, classId),
    listStudentsForAdmin(institutionId, authUserId, { classId }),
    listTeacherAssignments(institutionId, authUserId),
  ]);

  const cls = classes.find((c) => c.id === classId);
  if (!cls) notFound();

  const classTeacherBySection = new Map<string, string[]>();
  const wholeClassTeachers: string[] = [];
  for (const a of teacherAssignments) {
    if (a.role_type !== "class_teacher" || a.class_id !== classId) continue;
    if (a.section_id) {
      const arr = classTeacherBySection.get(a.section_id) ?? [];
      arr.push(a.teacher_name);
      classTeacherBySection.set(a.section_id, arr);
    } else {
      wholeClassTeachers.push(a.teacher_name);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/classes" className="text-sm text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">
          ← All classes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Class {cls.name}</h1>
        {wholeClassTeachers.length > 0 ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Class teacher: {wholeClassTeachers.join(", ")}</p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Divisions</h2>
        {sections.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            No divisions yet — add one under <Link href="/academic" className="underline">Academic Setup</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-400 dark:text-zinc-500">
                  <th className="pb-2 font-medium">Division</th>
                  <th className="pb-2 font-medium">Class teacher</th>
                  <th className="pb-2 font-medium">Students</th>
                  <th className="pb-2 font-medium text-right">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => {
                  const teachers = classTeacherBySection.get(s.id) ?? [];
                  const count = students.filter((st) => st.section_name === s.name).length;
                  return (
                    <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 text-zinc-900 dark:text-zinc-50">{s.name}</td>
                      <td className="py-2 text-zinc-500 dark:text-zinc-400">
                        {teachers.length > 0 ? teachers.join(", ") : (
                          <span>
                            Not assigned — <Link href="/staff" className="underline">assign one</Link>
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-zinc-500 dark:text-zinc-400">{count}</td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/attendance?classId=${classId}&sectionId=${s.id}&date=${today}`}
                          className="text-xs text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300"
                        >
                          View / take today&apos;s attendance
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Students ({students.length})</h2>
          <Link href={`/students?classId=${classId}`} className="text-xs text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300">
            Open in Students (search/edit/delete)
          </Link>
        </div>
        {students.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No students enrolled in this class yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-400 dark:text-zinc-500">
                  <th className="pb-2 font-medium">Admission no.</th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Division</th>
                  <th className="pb-2 font-medium">Login ID</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{s.admission_number}</td>
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">
                      <Link href={`/students/${s.id}`} className="underline hover:text-indigo-600 dark:hover:text-indigo-400">{s.full_name}</Link>
                    </td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{s.section_name ?? "—"}</td>
                    <td className="py-2 text-zinc-500 dark:text-zinc-400">{s.login_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
