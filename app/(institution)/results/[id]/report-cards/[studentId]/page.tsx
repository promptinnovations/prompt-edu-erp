import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { can } from "../../../../../../services/permissions/permission-service";
import { getTeacherClassScope } from "../../../../../../services/scope/teacher-scope-service";
import { getInstitution } from "../../../../../../services/institution/institution-service";
import {
  getExamination, getExaminationMarksMatrix, getResults, getGradeBands, resolveGradeBand,
} from "../../../../../../modules/examination/service";
import { getStudent, getCurrentEnrollment } from "../../../../../../modules/students/service";
import { listAcademicYears } from "../../../../../../modules/academic/service";
import { getStudentAttendanceSummary } from "../../../../../../modules/attendance/service";
import { formatDateIST, todayIST } from "../../../../../../services/datetime/ist";
import { formatMarks } from "../../../../../../services/format/marks";
import PrintButton from "../../../../../components/PrintButton";
import PrintLetterhead from "../../../../../components/PrintLetterhead";

/** "Result > Report Cards" — one student's printable Progress Report:
 *  photo + identity block, a subject-by-subject TE/CE marks table with a
 *  per-subject Grade (resolved against the exam's own grade_scale_id, same
 *  bands Settings > Grading edits — never a literal cutoff here), an
 *  attendance-during-the-year line, and the overall total/percentage/grade
 *  summary (from the same computed `results` row every other results view
 *  reads) — all on the institution's own letterhead, with signature blocks
 *  for printing.
 *  §Report-card-redesign follow-up (reference layout + explicit column
 *  list: "subject, TE, Total TE, CE, Total CE, Grade ... CE/Total CE only
 *  for term examinations"): columns are now TE (the written/terminal marks
 *  obtained — previously labelled "Written"/"Marks Obtained"), Total TE
 *  (that portion's max marks — previously "Max Marks"), CE/Total CE
 *  (obtained/max continuous-evaluation marks — previously CE was shown but
 *  its own max wasn't a separate column), and a per-subject Grade in place
 *  of the old per-subject Pass/Fail badge. CE/Total CE still only render
 *  when `hasCe` (this exam has CE components) — in practice that's exactly
 *  "term examinations", since Daily Assessment / non-CE exam types never
 *  populate ce_components, so no separate periodicity check is needed.
 *  Rank and the old per-subject/overall Pass-Fail badges were dropped from
 *  this layout (not in the requested field list); Total Marks/Total
 *  Percentage/Total Grade/Attendance now live together in one summary
 *  block at the bottom instead of split between the identity block and a
 *  separate total row. The Grade → performance-descriptor legend
 *  (grade_bands.description, migration 0060) is intentionally NOT printed
 *  here — it's institution reference data for Settings > Grading, not
 *  part of the report card per the explicit ask. */
export default async function ReportCardPage({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { id, studentId } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound();

  // §"give access to ... report cards of only their assigned classes not
  // all" — a teacher hitting this URL directly for a student outside their
  // scope must 404, not just have the link hidden on the list page above.
  const hasBroadResultAccess = ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || can(ctx.permissions, "settings.manage");
  const teacherScope = hasBroadResultAccess ? null : await getTeacherClassScope(institutionId, authUserId, ctx.userId);

  const [institution, matrix, results, student, academicYears] = await Promise.all([
    getInstitution(institutionId, authUserId),
    getExaminationMarksMatrix(institutionId, authUserId, id),
    getResults(institutionId, authUserId, id, teacherScope ? [...teacherScope.classIds] : null),
    getStudent(institutionId, authUserId, studentId),
    listAcademicYears(institutionId, authUserId),
  ]);
  const studentRows = matrix.filter((r) => r.student_id === studentId);
  if (studentRows.length === 0) notFound();
  // A scoped viewer whose classes don't cover this student's current
  // enrollment must 404 here too — `results` above already excludes them
  // (so `overall` below would be undefined either way), but `matrix` is
  // intentionally left unfiltered above (still needed to resolve
  // studentRows/subjects for legitimate viewers), so it alone can't
  // distinguish "wrong student" from "no results computed yet".
  if (teacherScope) {
    const enrollment = await getCurrentEnrollment(institutionId, authUserId, studentId);
    if (!enrollment || !teacherScope.classIds.has(enrollment.class_id)) notFound();
  }
  // A scoped viewer whose own classIds don't cover this student's current
  // enrollment never even reaches the "no result computed yet" case below
  // — getResults() above already excluded them, so `results` (unlike
  // `matrix`, which is intentionally left unfiltered to still resolve
  // studentRows/subjects) simply has no row for them.
  if (teacherScope) {
    const enrollment = await getCurrentEnrollment(institutionId, authUserId, studentId);
    if (!enrollment || !teacherScope.classIds.has(enrollment.class_id)) notFound();
  }
  const overall = results.find((r) => r.student_id === studentId);
  const first = studentRows[0];
  const hasCe = studentRows.some((r) => r.ce_components.length > 0);
  // Per-subject Grade column — resolved against the same grade_scale_id/
  // grade_bands the exam itself (and the overall grade below) uses, never
  // a hardcoded cutoff (§K). No grade_scale_id configured -> empty bands,
  // every subject's Grade cell falls back to "—".
  const gradeBands = examination.grade_scale_id
    ? await getGradeBands(institutionId, authUserId, examination.grade_scale_id)
    : [];

  const academicYear = academicYears.find((y) => y.id === examination.academic_year_id) ?? null;
  const attendance = academicYear
    ? await getStudentAttendanceSummary(
        institutionId, authUserId, studentId,
        academicYear.start_date,
        academicYear.end_date < todayIST() ? academicYear.end_date : todayIST()
      )
    : null;

  return (
    <div className="space-y-4">
      <Link href={`/results/${id}/report-cards`} className="no-print text-sm text-zinc-500 underline">
        ← Back to report cards
      </Link>
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>

      <section className="print-area mx-auto max-w-3xl rounded-card border bg-white p-8">
        <div className="mb-6 text-center">
          <PrintLetterhead
            institutionName={institution?.appName || institution?.name || "PROMPT EDU ERP"}
            logoCode={institution?.logoFileId ? institution.code : null}
          />
          <p className="mt-2 text-lg font-semibold uppercase tracking-[0.08em] text-[var(--heading)]">Progress Report</p>
          <p className="text-sm text-zinc-500">
            {examination.name}{academicYear ? ` · ${academicYear.name}` : ""}
          </p>
        </div>

        <div className="mb-6 flex items-start gap-4 rounded-xl border bg-zinc-50 p-4">
          {student?.photo_file_id ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route
            <img
              src={`/api/files/${student.photo_file_id}`}
              alt=""
              className="h-20 w-20 rounded-xl border object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-xl border bg-white text-2xl font-semibold text-zinc-400">
              {first.student_name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="text-sm">
            <div className="text-base font-semibold text-zinc-900">{first.student_name}</div>
            <div className="text-zinc-500">Admission No: {first.admission_number}</div>
            <div className="text-zinc-500">
              Class: {first.class_name ?? "—"}{first.section_name ? ` - ${first.section_name}` : ""}
              {first.roll_number != null ? ` · Roll No: ${first.roll_number}` : ""}
            </div>
            {student?.gender || student?.date_of_birth ? (
              <div className="text-zinc-500">
                {student.gender ? `Gender: ${student.gender}` : ""}
                {student.gender && student.date_of_birth ? " · " : ""}
                {student.date_of_birth ? `DOB: ${formatDateIST(student.date_of_birth)}` : ""}
              </div>
            ) : null}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-1.5">Subject</th>
              <th className="py-1.5 text-right">TE</th>
              <th className="py-1.5 text-right">Total TE</th>
              {hasCe ? <th className="py-1.5 text-right">CE</th> : null}
              {hasCe ? <th className="py-1.5 text-right">Total CE</th> : null}
              <th className="py-1.5 text-right">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {studentRows.map((r) => {
              // Per-subject display applies the same unit rules as
              // computeStudentResult(): absent units drop out of numerator
              // and denominator.
              const units = [
                { max: Number(r.max_marks), obtained: r.marks_obtained, absent: r.is_absent },
                ...r.ce_components.map((c) => ({ max: Number(c.max_marks), obtained: c.marks_obtained, absent: c.is_absent })),
              ];
              const sat = units.filter((u) => !u.absent && u.obtained != null);
              const satObtained = sat.reduce((a, u) => a + Number(u.obtained), 0);
              const satMax = units.filter((u) => !u.absent).reduce((a, u) => a + u.max, 0);
              const subjectPct = sat.length > 0 && satMax > 0 ? (satObtained / satMax) * 100 : null;
              const subjectGrade = subjectPct != null ? resolveGradeBand(gradeBands, subjectPct) : null;
              const ceMax = r.ce_components.reduce((a, c) => a + Number(c.max_marks), 0);
              const ceSat = r.ce_components.filter((c) => !c.is_absent && c.marks_obtained != null);
              const ceText = r.ce_components.length === 0 ? "—"
                : r.ce_components.every((c) => c.is_absent) ? "Absent"
                : ceSat.length === 0 ? "—"
                : `${ceSat.reduce((a, c) => a + Number(c.marks_obtained), 0)}/${ceMax}`;
              return (
                <tr key={r.exam_subject_id}>
                  <td className="py-1.5">
                    {r.subject_name}
                    {r.ce_components.length > 1 ? (
                      <div className="text-[11px] text-zinc-500">
                        CE: {r.ce_components.map((c) => `${c.name} ${c.is_absent ? "AB" : c.marks_obtained ? formatMarks(c.marks_obtained) : "—"}/${formatMarks(c.max_marks)}`).join(" · ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right">{r.is_absent ? "Absent" : r.marks_obtained ? formatMarks(r.marks_obtained) : "—"}</td>
                  <td className="py-1.5 text-right">{formatMarks(r.max_marks)}</td>
                  {hasCe ? <td className="py-1.5 text-right">{ceText === "—" || ceText === "Absent" ? ceText : formatMarks(ceSat.reduce((a, c) => a + Number(c.marks_obtained), 0))}</td> : null}
                  {hasCe ? <td className="py-1.5 text-right">{formatMarks(ceMax)}</td> : null}
                  <td className="py-1.5 text-right font-medium text-zinc-900">{subjectGrade?.grade_label ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {overall ? (
          <div className="mt-6 space-y-1.5 rounded-xl border bg-zinc-50 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Total Marks</span>
              <span className="font-medium text-zinc-900">{formatMarks(overall.total_marks)} / {formatMarks(overall.max_total_marks)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Total Percentage</span>
              <span className="font-medium text-zinc-900">{Number(overall.percentage).toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Total Grade</span>
              <span className="font-medium text-zinc-900">{overall.grade_label ?? "—"}</span>
            </div>
            {attendance ? (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Attendance</span>
                <span className="font-medium text-zinc-900">{attendance.present_days} / {attendance.total_days} days ({attendance.present_percent}%)</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            Overall total/grade not computed yet — compute results from the examination&rsquo;s detail page first.
          </p>
        )}

        <div className="mt-16 grid grid-cols-2 gap-6 text-center text-xs text-zinc-500">
          <div className="border-t pt-2">Class Teacher</div>
          <div className="border-t pt-2">Principal</div>
        </div>

        <p className="mt-8 flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          <span>Printed on {formatDateIST(todayIST())}</span>
          <span>PROMPT EDU ERP · Prompt Innovations</span>
        </p>
      </section>
    </div>
  );
}
