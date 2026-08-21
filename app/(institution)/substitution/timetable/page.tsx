import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { listClasses, listSections, listSubjects } from "../../../../modules/academic/service";
import { listStaff } from "../../../../modules/staff/service";
import { listTimetable, DAY_NAMES } from "../../../../modules/substitution/service";
import AddTimetablePeriodForm from "./AddTimetablePeriodForm";
import DeleteTimetablePeriodButton from "./DeleteTimetablePeriodButton";
import TimetableTemplateForm from "./TimetableTemplateForm";

export default async function TimetablePage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "substitution");
  if (!can(ctx.permissions, "substitution.timetable.manage")) redirect("/substitution");

  const [classes, sections, subjects, staff, periods] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listSubjects(institutionId, authUserId),
    listStaff(institutionId, authUserId),
    listTimetable(institutionId, authUserId),
  ]);

  const grouped = new Map<string, { className: string; sectionName: string; rows: typeof periods }>();
  for (const p of periods) {
    const key = `${p.classId}:${p.sectionId}`;
    if (!grouped.has(key)) grouped.set(key, { className: p.className, sectionName: p.sectionName, rows: [] });
    grouped.get(key)!.rows.push(p);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/substitution" className="text-sm text-zinc-500 dark:text-zinc-400 underline">← Back to Substitution</Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Weekly Timetable</h1>
        </div>
        <Link href="/import" className="text-sm text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
          Bulk upload timetable (Excel) →
        </Link>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Configured bulk-upload template</h2>
        <TimetableTemplateForm classes={classes.map((c) => ({ id: c.id, name: c.name }))} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add / update a period</h2>
        <AddTimetablePeriodForm
          classes={classes}
          sections={sections}
          subjects={subjects}
          teachers={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Current timetable</h2>
        {grouped.size === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No periods set up yet — add one above, or bulk-upload an Excel file.</p>
        ) : (
          <div className="space-y-5">
            {Array.from(grouped.entries()).map(([key, group]) => (
              <div key={key}>
                <h3 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">{group.className} – {group.sectionName}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        <th className="py-1 pr-3">Day</th>
                        <th className="py-1 pr-3">Period</th>
                        <th className="py-1 pr-3">Subject</th>
                        <th className="py-1 pr-3">Teacher</th>
                        <th className="py-1 pr-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {group.rows.map((p) => (
                        <tr key={p.id}>
                          <td className="py-1.5 pr-3">{DAY_NAMES[p.dayOfWeek]}</td>
                          <td className="py-1.5 pr-3">{p.periodNo}</td>
                          <td className="py-1.5 pr-3">{p.subjectName ?? "—"}</td>
                          <td className="py-1.5 pr-3">{p.teacherName ?? <span className="text-zinc-400">Free</span>}</td>
                          <td className="py-1.5 pr-3"><DeleteTimetablePeriodButton periodId={p.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
