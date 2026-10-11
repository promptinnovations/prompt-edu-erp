import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { can } from "../../../../../services/permissions/permission-service";
import { getTeacherClassScope } from "../../../../../services/scope/teacher-scope-service";
import {
  getExamination, getResults, isDailyAssessmentExamination, listDailyAssessmentReportCardRows,
} from "../../../../../modules/examination/service";
import { listClasses } from "../../../../../modules/academic/service";
import { sortClasses } from "../../../../../services/academic/roster-order";
import { formatMarks } from "../../../../../services/format/marks";

/** "Result > Report Cards" — one link per student into their own printable
 *  report card, plus per-class "print the whole set" links.
 *
 *  §Daily-assessment-report-card: getResults() returns nothing for a Daily
 *  Assessment register (its marks never reach `results`), which left this
 *  page permanently empty for the monthly registers. Those now list from
 *  listDailyAssessmentReportCardRows() instead — the same students, with
 *  their cumulative month total and percentage in place of Grade/Rank. */
export default async function ReportCardsListPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ classId?: string }>;
}) {
  const { id } = await params;
  const { classId = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound();

  // §"give access to ... report cards of only their assigned classes not
  // all" — same scoping as Consolidated Marks.
  const hasBroadResultAccess = ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || can(ctx.permissions, "settings.manage");
  const teacherScope = hasBroadResultAccess ? null : await getTeacherClassScope(institutionId, authUserId, ctx.userId);
  const allowedClassIds = teacherScope ? [...teacherScope.classIds] : null;

  const [isDaily, allClasses] = await Promise.all([
    isDailyAssessmentExamination(institutionId, authUserId, id),
    listClasses(institutionId, authUserId),
  ]);
  const classes = sortClasses(teacherScope ? allClasses.filter((c) => teacherScope.classIds.has(c.id)) : allClasses);

  const rows = isDaily
    ? (await listDailyAssessmentReportCardRows(institutionId, authUserId, id, allowedClassIds)).map((r) => ({
        student_id: r.student_id,
        student_name: r.student_name,
        total: `${formatMarks(String(r.obtained))} / ${formatMarks(String(r.max))}`,
        grade: r.percentage != null ? `${r.percentage}%` : "—",
        rank: "—",
      }))
    : (await getResults(institutionId, authUserId, id, allowedClassIds)).map((r) => ({
        student_id: r.student_id,
        student_name: r.student_name,
        total: `${formatMarks(r.total_marks)} / ${formatMarks(r.max_total_marks)}`,
        grade: r.grade_label ?? "—",
        rank: r.rank != null ? String(r.rank) : "—",
      }));

  return (
    <div className="space-y-6">
      <Link href="/results" className="text-sm text-zinc-500 underline">← Back to Results</Link>
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Report Cards — {examination.name}</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {isDaily ? (
            <>No marks entered in this month&rsquo;s register yet — enter them from its{" "}
              <Link href={`/examinations/${id}`} className="underline">detail page</Link> first.</>
          ) : (
            <>No results computed yet for this examination — compute results from its{" "}
              <Link href={`/examinations/${id}`} className="underline">detail page</Link> first.</>
          )}
        </p>
      ) : null}

      {/* §Print-center-class-grid ("it will open all report cards of that
          class") — the same whole-class print the Print Center links to,
          reachable from the examination's own report-card list too. */}
      {classes.length > 0 ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Print a whole class</h2>
          <p className="mb-3 text-xs text-zinc-500">Opens every student&rsquo;s card in one page, one per printed sheet.</p>
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={`/results/${id}/report-cards/print-all`}
              className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
            >
              All classes
            </Link>
            {classes.map((c) => (
              <Link
                key={c.id}
                href={`/results/${id}/report-cards/print-all?classId=${c.id}`}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  classId === c.id ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
              <tr>
                <th className="px-4 py-2">Student</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">{isDaily ? "Percentage" : "Grade"}</th>
                {isDaily ? null : <th className="px-4 py-2">Rank</th>}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.student_id}>
                  <td className="px-4 py-2">{r.student_name}</td>
                  <td className="px-4 py-2">{r.total}</td>
                  <td className="px-4 py-2">{r.grade}</td>
                  {isDaily ? null : <td className="px-4 py-2">{r.rank}</td>}
                  <td className="px-4 py-2 text-right">
                    <Link href={`/results/${id}/report-cards/${r.student_id}`} className="text-sm text-zinc-600 underline">
                      View / print
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
