import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { listClasses, listSections, listClassSubjects, getCurrentAcademicYear } from "../../../../modules/academic/service";
import { listStudentsForAdmin, getClassStrength } from "../../../../modules/students/service";
import { listTeacherAssignments } from "../../../../modules/staff/service";
import { listExaminationsForClass } from "../../../../modules/examination/service";
import { listDisciplineRecords } from "../../../../modules/discipline/service";
import { listAchievements } from "../../../../modules/achievements/service";
import { listSkillSubmissions } from "../../../../modules/skills/service";
import { listReadingRecords } from "../../../../modules/library/service";
import RecomputeRollNumbersButton from "../RecomputeRollNumbersButton";
import { todayIST } from "../../../../services/datetime/ist";

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
  const today = todayIST();

  const [classes, sections, students, teacherAssignments, classSubjects, academicYear, strength, exams] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId, classId),
    listStudentsForAdmin(institutionId, authUserId, { classId, includeParentContact: true }),
    listTeacherAssignments(institutionId, authUserId),
    listClassSubjects(institutionId, authUserId, classId),
    getCurrentAcademicYear(institutionId, authUserId),
    getClassStrength(institutionId, authUserId, classId),
    listExaminationsForClass(institutionId, authUserId, classId),
  ]);

  const [disciplineRecords, achievements, skillSubmissions, readingRecords] = await Promise.all([
    can(ctx.permissions, "discipline.view") ? listDisciplineRecords(institutionId, authUserId, undefined, classId) : Promise.resolve([]),
    listAchievements(institutionId, authUserId, undefined, classId),
    listSkillSubmissions(institutionId, authUserId, undefined, classId),
    can(ctx.permissions, "library.view") ? listReadingRecords(institutionId, authUserId, undefined, classId) : Promise.resolve([]),
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
        <Link href="/classes" className="text-sm text-zinc-500 underline hover:text-zinc-800">
          ← All classes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--heading)]">Class {cls.name}</h1>
        {wholeClassTeachers.length > 0 ? (
          <p className="mt-1 text-sm text-zinc-500">Class teacher: {wholeClassTeachers.join(", ")}</p>
        ) : null}
        <p className="mt-1 text-sm text-zinc-500">
          Strength: {strength.total} total — {strength.boys} boys, {strength.girls} girls
          {strength.other > 0 ? `, ${strength.other} other` : ""}
        </p>
      </div>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Divisions</h2>
        {sections.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No divisions yet — add one under <Link href="/academic" className="underline">Academic Setup</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="pb-2 font-medium">Division</th>
                  <th className="pb-2 font-medium">Class teacher</th>
                  <th className="pb-2 font-medium">Students</th>
                  <th className="pb-2 font-medium text-right">Roll numbers</th>
                  <th className="pb-2 font-medium text-right">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => {
                  const teachers = classTeacherBySection.get(s.id) ?? [];
                  const count = students.filter((st) => st.section_name === s.name).length;
                  return (
                    <tr key={s.id} className="border-b">
                      <td className="py-2 text-zinc-900">{s.name}</td>
                      <td className="py-2 text-zinc-500">
                        {teachers.length > 0 ? teachers.join(", ") : (
                          <span>
                            Not assigned — <Link href="/staff" className="underline">assign one</Link>
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-zinc-500">{count}</td>
                      <td className="py-2 text-right">
                        {academicYear ? (
                          <RecomputeRollNumbersButton classId={classId} sectionId={s.id} academicYearId={academicYear.id} />
                        ) : (
                          <span className="text-xs text-zinc-500">No current academic year</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/attendance?classId=${classId}&sectionId=${s.id}&date=${today}`}
                          className="text-xs text-indigo-600 underline hover:text-indigo-800"
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

      <section className="rounded-card border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--heading)]">Subjects</h2>
          <Link href="/academic" className="text-xs text-indigo-600 underline hover:text-indigo-800">
            Manage in Academic Setup
          </Link>
        </div>
        {classSubjects.length === 0 ? (
          <p className="text-sm text-zinc-500">No subjects assigned to this class yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {classSubjects.map((cs) => (
              <span
                key={cs.id}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700"
              >
                {cs.subject_name}
                {!cs.is_core ? <span className="ml-1 text-zinc-500">(practical)</span> : null}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-card border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--heading)]">Students ({students.length})</h2>
          <Link href={`/students?classId=${classId}`} className="text-xs text-indigo-600 underline hover:text-indigo-800">
            Open in Students (search/edit/delete)
          </Link>
        </div>
        {students.length === 0 ? (
          <p className="text-sm text-zinc-500">No students enrolled in this class yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="pb-2 font-medium">Roll no.</th>
                  <th className="pb-2 font-medium">Admission no.</th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Parent</th>
                  <th className="pb-2 font-medium">Division</th>
                  <th className="pb-2 font-medium">Login ID</th>
                </tr>
              </thead>
              <tbody>
                {[...students]
                  .sort((a, b) => (a.section_name ?? "").localeCompare(b.section_name ?? "") || (a.roll_number ?? 999) - (b.roll_number ?? 999) || a.full_name.localeCompare(b.full_name))
                  .map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="py-2 text-zinc-500">{s.roll_number ?? "—"}</td>
                    <td className="py-2 text-zinc-500">{s.admission_number}</td>
                    <td className="py-2 text-zinc-900">
                      <Link href={`/students/${s.id}`} className="underline hover:text-indigo-600">{s.full_name}</Link>
                    </td>
                    <td className="py-2 text-zinc-500">{s.parent_name ?? "—"}</td>
                    <td className="py-2 text-zinc-500">{s.section_name ?? "—"}</td>
                    <td className="py-2 text-zinc-500">{s.login_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Exams ({exams.length})</h2>
        {exams.length === 0 ? (
          <p className="text-sm text-zinc-500">No examinations cover this class yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {exams.map((e, i) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700">{i + 1}. {e.name}</span>
                <span className="flex gap-3">
                  <Link href={`/results/${e.id}`} className="text-xs text-indigo-600 underline hover:text-indigo-800">Result</Link>
                  <Link href={`/results/${e.id}/consolidated`} className="text-xs text-indigo-600 underline hover:text-indigo-800">Consolidated</Link>
                  <Link href={`/results/${e.id}/report-cards`} className="text-xs text-indigo-600 underline hover:text-indigo-800">Report cards</Link>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {can(ctx.permissions, "discipline.view") ? (
        <section className="rounded-card border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--heading)]">Discipline records ({disciplineRecords.length})</h2>
            <Link href="/discipline" className="text-xs text-indigo-600 underline hover:text-indigo-800">
              Open Discipline (add entry / full reports)
            </Link>
          </div>
          {disciplineRecords.length === 0 ? (
            <p className="text-sm text-zinc-500">No discipline records for this class.</p>
          ) : (
            <ul className="space-y-1.5">
              {disciplineRecords.slice(0, 10).map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">{d.student_name} — {d.category_name}</span>
                  <span className="text-xs text-zinc-500">{d.date}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--heading)]">
            Skills &amp; achievements ({skillSubmissions.length + achievements.length})
          </h2>
          <span className="flex gap-3">
            <Link href="/skills" className="text-xs text-indigo-600 underline hover:text-indigo-800">Skills</Link>
            <Link href="/achievements" className="text-xs text-indigo-600 underline hover:text-indigo-800">Achievements</Link>
          </span>
        </div>
        {skillSubmissions.length === 0 && achievements.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing recorded for this class yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {achievements.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700">{a.student_name} — {a.title} ({a.category_name})</span>
                <span className="text-xs text-zinc-500">{a.status}</span>
              </li>
            ))}
            {skillSubmissions.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700">{s.student_name} — {s.activity_name}</span>
                <span className="text-xs text-zinc-500">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {can(ctx.permissions, "library.view") ? (
        <section className="rounded-card border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--heading)]">Library — reading record ({readingRecords.length})</h2>
            <Link href="/library" className="text-xs text-indigo-600 underline hover:text-indigo-800">
              Open Library
            </Link>
          </div>
          {readingRecords.length === 0 ? (
            <p className="text-sm text-zinc-500">No reading records for this class yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {readingRecords.slice(0, 10).map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">{r.student_name} — {r.book_title}</span>
                  <span className="text-xs text-zinc-500">{r.review_status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
