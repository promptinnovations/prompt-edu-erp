import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { getInstitution } from "../../../../../../services/institution/institution-service";
import { getExamination, getExaminationMarksMatrix, getResults } from "../../../../../../modules/examination/service";
import PrintButton from "../../../../../components/PrintButton";
import PrintLetterhead from "../../../../../components/PrintLetterhead";

/** "Result > Report Cards" — one student's printable report card: subject
 *  by subject marks, overall total/percentage/grade/rank (from the same
 *  computed `results` row every other results view reads), on the
 *  institution's own letterhead. */
export default async function ReportCardPage({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { id, studentId } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound();

  const [institution, matrix, results] = await Promise.all([
    getInstitution(institutionId, authUserId),
    getExaminationMarksMatrix(institutionId, authUserId, id),
    getResults(institutionId, authUserId, id),
  ]);
  const studentRows = matrix.filter((r) => r.student_id === studentId);
  if (studentRows.length === 0) notFound();
  const overall = results.find((r) => r.student_id === studentId);
  const student = studentRows[0];

  return (
    <div className="space-y-4">
      <Link href={`/results/${id}/report-cards`} className="no-print text-sm text-zinc-500 dark:text-zinc-400 underline">
        ← Back to report cards
      </Link>
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>

      <section className="print-area mx-auto max-w-2xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8">
        <div className="mb-6 text-center">
          <PrintLetterhead
            institutionName={institution?.appName || institution?.name || "PROMPT EDU ERP"}
            logoCode={institution?.logoFileId ? institution.code : null}
          />
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Report Card — {examination.name}</p>
        </div>

        <div className="mb-6 flex justify-between text-sm">
          <div>
            <div className="font-medium text-zinc-900 dark:text-zinc-50">{student.student_name}</div>
            <div className="text-zinc-500 dark:text-zinc-400">Admission No: {student.admission_number}</div>
          </div>
          {overall ? (
            <div className="text-right">
              <div className="text-zinc-500 dark:text-zinc-400">Rank: {overall.rank ?? "—"}</div>
              <div className="text-zinc-500 dark:text-zinc-400">Grade: {overall.grade_label ?? "—"}</div>
            </div>
          ) : null}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400">
              <th className="py-1.5">Subject</th>
              <th className="py-1.5 text-right">Max Marks</th>
              <th className="py-1.5 text-right">Pass Marks</th>
              <th className="py-1.5 text-right">Marks Obtained</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {studentRows.map((r) => (
              <tr key={r.exam_subject_id}>
                <td className="py-1.5">{r.subject_name}</td>
                <td className="py-1.5 text-right">{r.max_marks}</td>
                <td className="py-1.5 text-right">{r.pass_marks}</td>
                <td className="py-1.5 text-right">{r.is_absent ? "Absent" : r.marks_obtained ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {overall ? (
          <div className="mt-6 flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-3 text-sm font-medium">
            <span>Total</span>
            <span>{overall.total_marks} / {overall.max_total_marks} ({Number(overall.percentage).toFixed(2)}%)</span>
          </div>
        ) : null}

        <p className="mt-10 text-center text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
          PROMPT EDU ERP · Prompt Innovations
        </p>
      </section>
    </div>
  );
}
