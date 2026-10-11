import Link from "next/link";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { getInstitution, institutionReportName } from "../../../../services/institution/institution-service";
import { getCumulativeMarksheet } from "../../../../modules/examination/service";
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
  searchParams: Promise<{ academicYearId?: string; classId?: string; track?: string }>;
}) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");

  const { academicYearId: requestedYearId = "", classId = "", track: requestedTrack = "" } = await searchParams;

  const [institution, academicYears, currentYear, classesRaw] = await Promise.all([
    getInstitution(institutionId, authUserId),
    listAcademicYears(institutionId, authUserId),
    getCurrentAcademicYear(institutionId, authUserId),
    listClasses(institutionId, authUserId),
  ]);
  const classes = sortClasses(classesRaw);
  const academicYearId = requestedYearId || currentYear?.id || academicYears[0]?.id || "";

  // §Cumulative-track follow-up ("cumulative must be separate for academic &
  // islamic subjects, give a toggle or button to switch"). Only a
  // both-tracks institution gets the toggle — an academic-only or
  // islamic-only institution has exactly one track, so splitting it would
  // just hide half the page behind a pointless switch. Track order follows
  // the institution's own configured `track_order` (§K), never a
  // hardcoded academic-first assumption.
  const showTrackToggle = institution?.educationMode === "both";
  const trackOrder = institution?.trackOrder ?? ["academic", "islamic"];
  const track = showTrackToggle && (requestedTrack === "academic" || requestedTrack === "islamic")
    ? requestedTrack
    : null;

  const marksheet = academicYearId
    ? await getCumulativeMarksheet(institutionId, authUserId, academicYearId, classId || null, track)
    : { examinations: [], rows: [] };
  const trackLabel = track === "academic" ? "Academic" : track === "islamic" ? "Islamic" : "All subjects";

  return (
    <div className="space-y-6">
      <Link href="/results" className="text-sm text-zinc-500 underline">← Back to Results</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Cumulative Mark Sheet</h1>
        <PrintButton />
      </div>
      <p className="text-sm text-zinc-500">
        Every computed examination result in the selected academic year, side by side, with an average across all of them.
        {track ? ` Showing ${trackLabel.toLowerCase()} subjects only — each examination is recomputed from that track's subjects alone.` : ""}
      </p>

      <div className="no-print space-y-3">
        <CumulativeFilterForm
          academicYears={academicYears.map((y) => ({ id: y.id, name: y.name }))}
          classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          academicYearId={academicYearId}
          classId={classId}
          track={track}
        />
        {showTrackToggle ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-zinc-500">Subjects</span>
            {[
              { value: "", label: "All subjects" },
              ...trackOrder.map((t) => ({ value: t, label: t === "academic" ? "Academic" : "Islamic" })),
            ].map((opt) => {
              const params = new URLSearchParams({ academicYearId, classId });
              if (opt.value) params.set("track", opt.value);
              const active = (track ?? "") === opt.value;
              return (
                <Link
                  key={opt.value || "all"}
                  href={`?${params.toString()}`}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {opt.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      <section className="print-area overflow-hidden rounded-2xl border bg-white">
        <div className="p-4 pb-0">
          <PrintLetterhead
            institutionName={institutionReportName(institution)}
            logoCode={institution?.logoFileId ? institution.code : null}
            titleLines={["Cumulative Mark Sheet", track ? `${trackLabel} subjects` : "All subjects"]}
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
                <th className="px-3 py-2 text-center">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {marksheet.rows.map((row) => {
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
                    {/* §Cumulative-track follow-up: "instead of result use
                        Grade there" — the grade the average percentage earns
                        under the institution's default grade scale, replacing
                        the old Pass/Fail badge. */}
                    <td className="px-3 py-2 text-center font-medium text-zinc-900">
                      {row.average_grade_label ?? "—"}
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
