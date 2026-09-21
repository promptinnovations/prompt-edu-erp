import Link from "next/link";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { getInstitution } from "../../../../services/institution/institution-service";
import { getCumulativeMarksheet, isPass, PASS_COLOR, FAIL_COLOR } from "../../../../modules/examination/service";
import { listAcademicYears, getCurrentAcademicYear, listClasses } from "../../../../modules/academic/service";
import { sortClasses } from "../../../../services/academic/roster-order";
import PrintButton from "../../../components/PrintButton";
import PrintLetterhead from "../../../components/PrintLetterhead";
import CumulativeFilterForm from "./CumulativeFilterForm";

/** "Result > Cumulative Marksheet" — §491 Print Center follow-up
 *  ("Consolidated Mark Sheet ... exam-wise + cumulative"): the exam-wise
 *  Consolidated Marks page (/results/[id]/consolidated) already covers
 *  one examination at a time; this page is the companion "across the
 *  whole year" view — one row per student, one column per examination
 *  held in the selected academic year, an average percentage, and an
 *  overall pass/fail against the institution's own pass_pct (§K — never
 *  hardcoded). Built entirely on getCumulativeMarksheet(), which itself
 *  reads from the same `results` rows every other results view reads, so
 *  this sheet never disagrees with the per-exam Consolidated Marks or
 *  Report Cards about a student's outcome in any one examination. */
export default async function CumulativeMarksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ academicYearId?: string; classId?: string }>;
}) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");

  const { academicYearId: requestedYearId = "", classId = "" } = await searchParams;

  const [institution, academicYears, currentYear, classesRaw] = await Promise.all([
    getInstitution(institutionId, authUserId),
    listAcademicYears(institutionId, authUserId),
    getCurrentAcademicYear(institutionId, authUserId),
    listClasses(institutionId, authUserId),
  ]);
  const classes = sortClasses(classesRaw);
  const academicYearId = requestedYearId || currentYear?.id || academicYears[0]?.id || "";
  const passPct = institution?.passPct != null ? Number(institution.passPct) : 35;

  const marksheet = academicYearId
    ? await getCumulativeMarksheet(institutionId, authUserId, academicYearId, classId || null)
    : { examinations: [], rows: [] };

  return (
    <div className="space-y-6">
      <Link href="/results" className="text-sm text-zinc-500 underline">← Back to Results</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Cumulative Mark Sheet</h1>
        <PrintButton />
      </div>
      <p className="text-sm text-zinc-500">
        Every computed examination result in the selected academic year, side by side, with an average across all of them.
      </p>

      <div className="no-print">
        <CumulativeFilterForm
          academicYears={academicYears.map((y) => ({ id: y.id, name: y.name }))}
          classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          academicYearId={academicYearId}
          classId={classId}
        />
      </div>

      <section className="print-area overflow-hidden rounded-2xl border bg-white">
        <div className="p-4 pb-0">
          <PrintLetterhead
            institutionName={institution?.appName || institution?.name || "PROMPT EDU ERP"}
            logoCode={institution?.logoFileId ? institution.code : null}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
              <tr>
                <th className="sticky left-0 bg-zinc-50 px-4 py-2">Student</th>
                <th className="px-3 py-2">Class</th>
                {marksheet.examinations.map((e) => (
                  <th key={e.id} className="px-3 py-2 text-center">{e.name}</th>
                ))}
                <th className="px-3 py-2 text-center">Average</th>
                <th className="px-3 py-2 text-center">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {marksheet.rows.map((row) => {
                const passed = row.average_percentage != null ? isPass(row.average_percentage, passPct) : null;
                const examById = new Map(row.exams.map((e) => [e.examination_id, e]));
                return (
                  <tr key={row.student_id}>
                    <td className="sticky left-0 bg-white whitespace-nowrap px-4 py-2">
                      {row.student_name} <span className="text-zinc-500">({row.admission_number})</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                      {row.class_name ?? "—"}{row.section_name ? ` - ${row.section_name}` : ""}
                    </td>
                    {marksheet.examinations.map((e) => {
                      const score = examById.get(e.id);
                      return (
                        <td key={e.id} className="px-3 py-2 text-center">
                          {score ? (
                            <>
                              {Number(score.percentage).toFixed(1)}%
                              {score.grade_label ? <div className="text-xs text-zinc-500">{score.grade_label}</div> : null}
                            </>
                          ) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-medium">
                      {row.average_percentage != null ? `${row.average_percentage.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {passed == null ? (
                        "—"
                      ) : (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: passed ? PASS_COLOR : FAIL_COLOR }}
                        >
                          {passed ? "Pass" : "Fail"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {marksheet.rows.length === 0 ? (
                <tr><td colSpan={marksheet.examinations.length + 4} className="px-4 py-6 text-center text-zinc-500">
                  No computed results yet for this academic year — compute results from each examination&rsquo;s detail page first.
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
