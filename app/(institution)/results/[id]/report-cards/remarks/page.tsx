import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { can } from "../../../../../../services/permissions/permission-service";
import {
  getExamination, getResults, isDailyAssessmentExamination, listDailyAssessmentReportCardRows,
} from "../../../../../../modules/examination/service";
import { listClasses, listSections } from "../../../../../../modules/academic/service";
import { sortClasses } from "../../../../../../services/academic/roster-order";
import {
  getClassTeacherCoverage, coverageIncludes, listRemarkRoster, REPORT_CARD_REMARK_MAX,
} from "../../../../../../modules/report-card-remarks/service";
import RemarksForm from "./RemarksForm";

/** §Report-card-remark ("class teacher should have an option for typing
 *  report card remark") — a class teacher types one remark per student for
 *  this examination; it prints in the report card's remarks box.
 *
 *  A class teacher only sees the classes/divisions they are class teacher
 *  of; admins (marks.approve / settings.manage / super admin) see every
 *  class. Same "pick, then Load" selector shape as the other report pages,
 *  opening on the first permitted class by default. */
export default async function ReportCardRemarksPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ classId?: string; sectionId?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound();

  const unrestricted = ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || can(ctx.permissions, "settings.manage");
  const [coverage, allClasses, allSections, isDaily] = await Promise.all([
    unrestricted ? Promise.resolve(null) : getClassTeacherCoverage(institutionId, authUserId, ctx.userId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    isDailyAssessmentExamination(institutionId, authUserId, id),
  ]);

  const classes = sortClasses(coverage ? allClasses.filter((c) => coverage.byClass.has(c.id)) : allClasses);
  const back = (
    <Link href={`/results/${id}/report-cards`} className="text-sm text-zinc-500 underline">← Back to report cards</Link>
  );

  if (classes.length === 0) {
    return (
      <div className="space-y-4">
        {back}
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Report card remarks — {examination.name}</h1>
        <p className="rounded-card border bg-white p-5 text-sm text-zinc-600">
          Remarks are written by each class&rsquo;s class teacher. You aren&rsquo;t assigned as class teacher of any class
          this academic year — ask an admin to add the assignment under Staff.
        </p>
      </div>
    );
  }

  const classId = classes.some((c) => c.id === sp.classId) ? sp.classId! : classes[0].id;
  const sections = allSections
    .filter((s) => s.class_id === classId)
    .filter((s) => !coverage || coverageIncludes(coverage, classId, s.id));
  // A teacher who is class teacher of just ONE division of this class lands
  // on it directly; otherwise "" = every permitted division.
  const sectionId = sections.some((s) => s.id === sp.sectionId)
    ? sp.sectionId!
    : coverage && sections.length === 1 ? sections[0].id : "";

  const [roster, resultRows] = await Promise.all([
    listRemarkRoster(institutionId, authUserId, id, classId, sectionId || null),
    isDaily
      ? listDailyAssessmentReportCardRows(institutionId, authUserId, id, [classId]).then((rows) =>
          rows.map((r) => ({ student_id: r.student_id, text: r.percentage != null ? `${r.percentage}%` : null })))
      : getResults(institutionId, authUserId, id, [classId]).then((rows) =>
          rows.map((r) => ({ student_id: r.student_id, text: `${Number(r.percentage)}%${r.grade_label ? ` · ${r.grade_label}` : ""}` }))),
  ]);
  const resultBy = new Map(resultRows.map((r) => [r.student_id, r.text]));
  const rows = roster
    .filter((r) => !coverage || coverageIncludes(coverage, r.class_id, r.section_id))
    .map((r) => ({
      student_id: r.student_id, full_name: r.full_name, admission_number: r.admission_number,
      roll_number: r.roll_number, section_name: r.section_name,
      result: resultBy.get(r.student_id) ?? null, remark: r.remark,
    }));
  const selectedClass = classes.find((c) => c.id === classId)!;
  const selectedSection = sections.find((s) => s.id === sectionId);

  return (
    <div className="space-y-4">
      {back}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Report card remarks — {examination.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Each remark prints in the &ldquo;Class teacher&rsquo;s remarks&rdquo; box of that student&rsquo;s report card.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border bg-white p-4">
        <label className="text-xs font-medium text-zinc-600">
          Class
          <select name="classId" defaultValue={classId} className="mt-1 block rounded-full border px-3 py-1.5 text-sm">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Division
          <select name="sectionId" defaultValue={sectionId} className="mt-1 block rounded-full border px-3 py-1.5 text-sm">
            {!coverage || sections.length > 1 ? <option value="">All divisions</option> : null}
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700">Load</button>
        <span className="text-xs text-zinc-500">
          Showing {selectedClass.name}{selectedSection ? ` - ${selectedSection.name}` : ""}
        </span>
      </form>

      <section className="rounded-card border bg-white p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No students are enrolled in this class for the examination&rsquo;s academic year.</p>
        ) : (
          // key: remount on a class switch so the textareas' defaultValues reset.
          <RemarksForm key={`${classId}:${sectionId}`} examinationId={id} rows={rows} max={REPORT_CARD_REMARK_MAX} />
        )}
      </section>
    </div>
  );
}
