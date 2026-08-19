import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { getInstitution } from "../../../../../services/institution/institution-service";
import { getExamination, getExaminationMarksMatrix } from "../../../../../modules/examination/service";
import PrintButton from "../../../../components/PrintButton";
import PrintLetterhead from "../../../../components/PrintLetterhead";

/** "Result > Consolidated marks" — one student per row, one subject per
 *  column (the traditional "consolidated marksheet" format), pivoted
 *  client-side from getExaminationMarksMatrix()'s flat (student, subject)
 *  rows since the column set is dynamic per examination. */
export default async function ConsolidatedMarksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound();

  const [institution, rows] = await Promise.all([
    getInstitution(institutionId, authUserId),
    getExaminationMarksMatrix(institutionId, authUserId, id),
  ]);

  const subjects = new Map<string, { name: string; maxMarks: string }>();
  const studentOrder: string[] = [];
  const students = new Map<string, { name: string; admissionNumber: string }>();
  const cell = new Map<string, ExaminationMarksMatrixCell>();

  for (const r of rows) {
    if (!subjects.has(r.exam_subject_id)) subjects.set(r.exam_subject_id, { name: r.subject_name, maxMarks: r.max_marks });
    if (!students.has(r.student_id)) {
      students.set(r.student_id, { name: r.student_name, admissionNumber: r.admission_number });
      studentOrder.push(r.student_id);
    }
    cell.set(`${r.student_id}:${r.exam_subject_id}`, { marks: r.marks_obtained, isAbsent: r.is_absent });
  }
  const subjectList = Array.from(subjects.entries()).map(([id, v]) => ({ id, ...v }));

  return (
    <div className="space-y-6">
      <Link href="/results" className="text-sm text-zinc-500 dark:text-zinc-400 underline">← Back to Results</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Consolidated Marks — {examination.name}</h1>
        <PrintButton />
      </div>

      <section className="print-area overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="p-4 pb-0">
          <PrintLetterhead
            institutionName={institution?.appName || institution?.name || "PROMPT EDU ERP"}
            logoCode={institution?.logoFileId ? institution.code : null}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="sticky left-0 bg-zinc-50 dark:bg-zinc-950 px-4 py-2">Student</th>
                {subjectList.map((s) => (
                  <th key={s.id} className="px-3 py-2 text-center">{s.name}<div className="normal-case font-normal">/{s.maxMarks}</div></th>
                ))}
                <th className="px-3 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {studentOrder.map((studentId) => {
                const student = students.get(studentId)!;
                let total = 0;
                return (
                  <tr key={studentId}>
                    <td className="sticky left-0 bg-white dark:bg-zinc-900 whitespace-nowrap px-4 py-2">
                      {student.name} <span className="text-zinc-400 dark:text-zinc-500">({student.admissionNumber})</span>
                    </td>
                    {subjectList.map((s) => {
                      const c = cell.get(`${studentId}:${s.id}`);
                      const marks = c?.isAbsent ? "AB" : c?.marks ?? "—";
                      if (c && !c.isAbsent && c.marks) total += Number(c.marks);
                      return <td key={s.id} className="px-3 py-2 text-center">{marks}</td>;
                    })}
                    <td className="px-3 py-2 text-center font-medium">{total}</td>
                  </tr>
                );
              })}
              {studentOrder.length === 0 ? (
                <tr><td colSpan={subjectList.length + 2} className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500">
                  No students/subjects configured for this examination yet.
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

interface ExaminationMarksMatrixCell { marks: string | null; isAbsent: boolean }
