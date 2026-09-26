import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { listExaminations, getMarkEntryStatus, type MarkEntryStatusRow } from "../../../../modules/examination/service";

/** "Examination > Mark entry status" — pick an examination, see per-subject
 *  entered/pending counts, so an admin can spot which subjects still need
 *  marks entered instead of opening each subject's grid one at a time.
 *
 *  §CS.2 "mark entry status also should be shown class wise" -- previously
 *  a flat list of subjects for the whole exam; now grouped one section per
 *  class, each with its own subject rows.
 *
 *  §CS.3 "Mark entry status visible only for principal/management/admin
 *  not for teachers" -- this page (and its sidebar link/dashboard widget,
 *  see layout.tsx/dashboard/page.tsx) used to also let a teacher view a
 *  scoped-down version of this page (their own classes only). The user
 *  has now asked for teachers to have NO access to it at all, so this is
 *  gated on marks.approve -- the institution-wide "sees everything"
 *  signal held by institution_admin/management, never by a plain teacher
 *  (see database/scripts/seed.ts's roleGrants) -- with no scoped fallback.
 */
export default async function MarkEntryStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ examinationId?: string }>;
}) {
  const { examinationId = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");
  if (!can(ctx.permissions, "marks.approve")) notFound();

  const examinations = await listExaminations(institutionId, authUserId);
  const effectiveExamId = examinationId || examinations[0]?.id || "";
  const status = effectiveExamId ? await getMarkEntryStatus(institutionId, authUserId, effectiveExamId) : [];
  const examination = examinations.find((e) => e.id === effectiveExamId);

  // Group rows into one section per class, preserving the class-then-subject
  // order getMarkEntryStatus() already sorted (sortClasses, then subject name).
  const classGroups: Array<{ classId: string; className: string; rows: MarkEntryStatusRow[] }> = [];
  for (const row of status) {
    let group = classGroups.find((g) => g.classId === row.class_id);
    if (!group) {
      group = { classId: row.class_id, className: row.class_name, rows: [] };
      classGroups.push(group);
    }
    group.rows.push(row);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Mark Entry Status</h1>

      <section className="rounded-card border bg-white p-5">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Examination</label>
            <select
              name="examinationId"
              defaultValue={effectiveExamId}
              className="rounded-full border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              {examinations.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
            Load
          </button>
        </form>
      </section>

      {classGroups.length === 0 ? (
        <section className="overflow-hidden rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500">
          {examinations.length === 0
            ? "No examinations yet."
            : "No subjects/classes configured for this examination yet."}
        </section>
      ) : (
        classGroups.map((group) => (
          <section key={group.classId} className="overflow-hidden rounded-2xl border bg-white">
            <div className="border-b bg-zinc-50 px-4 py-2 text-sm font-semibold text-[var(--heading)]">
              {group.className}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-2">Subject</th>
                    <th className="px-4 py-2">Entered</th>
                    <th className="px-4 py-2">Expected</th>
                    <th className="px-4 py-2">Progress</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.rows.map((s) => {
                    const pct = s.expected > 0 ? Math.round((s.entered / s.expected) * 100) : 0;
                    const done = s.expected > 0 && s.entered >= s.expected;
                    return (
                      <tr key={`${group.classId}-${s.exam_subject_id}`}>
                        <td className="px-4 py-2">{s.subject_name}</td>
                        <td className="px-4 py-2">{s.entered}</td>
                        <td className="px-4 py-2">{s.expected}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-amber-500"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`text-xs ${done ? "text-emerald-600" : "text-amber-600"}`}>
                              {done ? "Complete" : `${pct}%`}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {examination ? (
                            <Link href={`/examinations/${examination.id}/marks/${s.exam_subject_id}`} className="text-sm text-zinc-600 underline">
                              Enter marks
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
