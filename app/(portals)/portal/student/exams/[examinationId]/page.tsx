import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnStudentId, NotLinkedNotice } from "../../_lib";
import {
  getExamination, getExaminationMarksMatrix, getResults, PASS_COLOR, FAIL_COLOR,
} from "../../../../../../modules/examination/service";
import { getStudent } from "../../../../../../modules/students/service";
import { listAcademicYears } from "../../../../../../modules/academic/service";
import { getStudentAttendanceSummary } from "../../../../../../modules/attendance/service";
import { getInstitution } from "../../../../../../services/institution/institution-service";
import { formatDateIST, todayIST } from "../../../../../../services/datetime/ist";
import { formatMarks } from "../../../../../../services/format/marks";
import PrintButton from "../../../../../components/PrintButton";
import PrintLetterhead from "../../../../../components/PrintLetterhead";

/** §"this page should show details of examination + exam wise results +
 *  consolidated marks of the child + report card + cumulative marks" — the
 *  per-exam drill-down behind the student's own "Exam performance" list:
 *  subject-wise consolidated marks plus a printable report card, same
 *  layout as the staff-side /results/[id]/report-cards/[studentId] page
 *  but scoped to the signed-in student's own record and gated on
 *  examination.published_at instead of a marks.* permission (mirrors
 *  listStudentResultHistory()'s own portal gate — an exam not yet
 *  published to the portal 404s here exactly like it's absent from that
 *  list). */
export default async function StudentExamDetailPage({ params }: { params: Promise<{ examinationId: string }> }) {
  const { examinationId } = await params;
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const examination = await getExamination(institutionId, authUserId, examinationId);
  if (!examination || !examination.published_at) notFound();

  const [institution, matrix, results, student, academicYears] = await Promise.all([
    getInstitution(institutionId, authUserId),
    getExaminationMarksMatrix(institutionId, authUserId, examinationId),
    getResults(institutionId, authUserId, examinationId),
    getStudent(institutionId, authUserId, ownStudentId),
    listAcademicYears(institutionId, authUserId),
  ]);
  const studentRows = matrix.filter((r) => r.student_id === ownStudentId);
  if (studentRows.length === 0) notFound();

  const overall = results.find((r) => r.student_id === ownStudentId);
  const first = studentRows[0];
  const overallPassed = overall ? overall.is_pass : null;
  const hasCe = studentRows.some((r) => r.ce_components.length > 0);

  const academicYear = academicYears.find((y) => y.id === examination.academic_year_id) ?? null;
  const attendance = academicYear
    ? await getStudentAttendanceSummary(
        institutionId, authUserId, ownStudentId,
        academicYear.start_date,
        academicYear.end_date < todayIST() ? academicYear.end_date : todayIST()
      )
    : null;

  return (
    <div className="space-y-4">
      <Link href="/portal/student/exams" className="no-print text-sm text-zinc-500 underline">
        ← Back to exam performance
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

        <div className="mb-6 flex items-start justify-between gap-6 rounded-xl border bg-zinc-50 p-4">
          <div className="flex items-start gap-4">
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
            </div>
          </div>
          <div className="shrink-0 text-right text-sm">
            {overall ? (
              <>
                <div className="text-zinc-500">Rank: <span className="font-medium text-zinc-900">{overall.rank ?? "—"}</span></div>
                <div className="text-zinc-500">Grade: <span className="font-medium text-zinc-900">{overall.grade_label ?? "—"}</span></div>
              </>
            ) : null}
            {attendance ? (
              <div className="text-zinc-500">
                Attendance: <span className="font-medium text-zinc-900">{attendance.present_percent}%</span>
                <span className="text-xs"> ({attendance.present_days}/{attendance.total_days} days)</span>
              </div>
            ) : null}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-1.5">Subject</th>
              <th className="py-1.5 text-right">Max Marks</th>
              <th className="py-1.5 text-right">Pass Marks</th>
              <th className="py-1.5 text-right">{hasCe ? "Written" : "Marks Obtained"}</th>
              {hasCe ? <th className="py-1.5 text-right">CE</th> : null}
              {hasCe ? <th className="py-1.5 text-right">Total</th> : null}
              <th className="py-1.5 text-right">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {studentRows.map((r) => {
              const units = [
                { max: Number(r.max_marks), obtained: r.marks_obtained, absent: r.is_absent },
                ...r.ce_components.map((c) => ({ max: Number(c.max_marks), obtained: c.marks_obtained, absent: c.is_absent })),
              ];
              const sat = units.filter((u) => !u.absent && u.obtained != null);
              const satObtained = sat.reduce((a, u) => a + Number(u.obtained), 0);
              const satMax = units.filter((u) => !u.absent).reduce((a, u) => a + u.max, 0);
              const subjectPassed = sat.length > 0 && satMax > 0 && Number(r.max_marks) > 0
                ? (satObtained / satMax) * 100 >= (Number(r.pass_marks) / Number(r.max_marks)) * 100
                : null;
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
                  <td className="py-1.5 text-right">{formatMarks(hasCe ? Number(r.max_marks) + ceMax : r.max_marks)}</td>
                  <td className="py-1.5 text-right">{formatMarks(r.pass_marks)}</td>
                  <td className="py-1.5 text-right">{r.is_absent ? "Absent" : r.marks_obtained ? formatMarks(r.marks_obtained) : "—"}</td>
                  {hasCe ? <td className="py-1.5 text-right">{ceText === "—" || ceText === "Absent" ? ceText : ceText.split("/").map(formatMarks).join("/")}</td> : null}
                  {hasCe ? <td className="py-1.5 text-right">{sat.length > 0 ? `${formatMarks(satObtained)}/${formatMarks(satMax)}` : "—"}</td> : null}
                  <td className="py-1.5 text-right">
                    {subjectPassed == null ? (
                      "—"
                    ) : (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: subjectPassed ? PASS_COLOR : FAIL_COLOR }}
                      >
                        {subjectPassed ? "Pass" : "Fail"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {overall ? (
          <div className="mt-6 flex items-center justify-between rounded-xl border bg-zinc-50 p-4 text-sm">
            <div>
              <span className="font-medium text-zinc-900">Total: </span>
              {formatMarks(overall.total_marks)} / {formatMarks(overall.max_total_marks)} ({Number(overall.percentage).toFixed(2)}%)
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium text-zinc-900">Overall Result:</span>
              {overallPassed != null ? (
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: overallPassed ? PASS_COLOR : FAIL_COLOR }}
                >
                  {overallPassed ? "PASS" : "FAIL"}
                </span>
              ) : "—"}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">Overall total/grade not available yet.</p>
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
