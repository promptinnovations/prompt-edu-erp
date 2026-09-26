import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { getInstitution } from "../../../../../services/institution/institution-service";
import {
  getExamination, getExaminationMarksMatrix, getResults, listClassesForExamination, PASS_COLOR, FAIL_COLOR,
} from "../../../../../modules/examination/service";
import type { MatrixCeCell } from "../../../../../modules/examination/service";
import PrintButton from "../../../../components/PrintButton";
import PrintLetterhead from "../../../../components/PrintLetterhead";
import ClassFilterForm from "./ClassFilterForm";

/** "Result > Consolidated marks" — one student per row, one subject per
 *  column (the traditional "consolidated marksheet" format), pivoted
 *  client-side from getExaminationMarksMatrix()'s flat (student, subject)
 *  rows since the column set is dynamic per examination. §Page-6 follow-up
 *  "select exam, class from dropdown" — the exam is already selected by
 *  being on this page (reached via the Results table); `classId` narrows
 *  the matrix to one of the exam's covered classes. §491 "executive
 *  design" follow-up — Grade and pass/fail Result columns added, both
 *  pulled straight from getResults() (the same computed row every other
 *  results view reads) rather than re-derived here, so this sheet never
 *  disagrees with Report Cards/Results about a student's outcome. */
export default async function ConsolidatedMarksPage({
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

  const [institution, rows, classOptions, results] = await Promise.all([
    getInstitution(institutionId, authUserId),
    getExaminationMarksMatrix(institutionId, authUserId, id, classId || null),
    listClassesForExamination(institutionId, authUserId, id),
    getResults(institutionId, authUserId, id),
  ]);
  const resultsByStudent = new Map(results.map((r) => [r.student_id, r]));

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
    cell.set(`${r.student_id}:${r.exam_subject_id}`, { marks: r.marks_obtained, isAbsent: r.is_absent, ce: r.ce_components });
  }
  const subjectList = Array.from(subjects.entries()).map(([id, v]) => ({ id, ...v }));

  return (
    <div className="space-y-6">
      <Link href="/results" className="text-sm text-zinc-500 underline">← Back to Results</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Consolidated Marks — {examination.name}</h1>
        <PrintButton />
      </div>

      <div className="no-print">
        <ClassFilterForm classes={classOptions} classId={classId} />
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
                {subjectList.map((s) => (
                  <th key={s.id} className="px-3 py-2 text-center">{s.name}<div className="normal-case font-normal">/{s.maxMarks}</div></th>
                ))}
                <th className="px-3 py-2 text-center">Total</th>
                <th className="px-3 py-2 text-center">Grade</th>
                <th className="px-3 py-2 text-center">Result</th>
                <th className="px-3 py-2 text-center">Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {studentOrder.map((studentId) => {
                const student = students.get(studentId)!;
                const overall = resultsByStudent.get(studentId);
                // Stored §8 overall verdict (results.is_pass) — never re-derived here.
                const overallPassed = overall ? overall.is_pass : null;
                let total = 0;
                return (
                  <tr key={studentId}>
                    <td className="sticky left-0 bg-white whitespace-nowrap px-4 py-2">
                      {student.name} <span className="text-zinc-500">({student.admissionNumber})</span>
                    </td>
                    {subjectList.map((s) => {
                      const c = cell.get(`${studentId}:${s.id}`);
                      const marks = c?.isAbsent ? "AB" : c?.marks ?? "—";
                      if (c && !c.isAbsent && c.marks) total += Number(c.marks);
                      // §CE: CE shown under the written mark in the same cell.
                      const ce = c?.ce ?? [];
                      for (const x of ce) if (!x.is_absent && x.marks_obtained) total += Number(x.marks_obtained);
                      return (
                        <td key={s.id} className="px-3 py-2 text-center">
                          {marks}
                          {ce.length > 0 ? (
                            <div className="text-[11px] text-zinc-500">
                              CE {ce.map((x) => (x.is_absent ? "AB" : x.marks_obtained ?? "—")).join("+")}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-medium">
                      {overall ? `${overall.total_marks}/${overall.max_total_marks}` : total}
                    </td>
                    <td className="px-3 py-2 text-center">{overall?.grade_label ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {overallPassed == null ? (
                        "—"
                      ) : (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: overallPassed ? PASS_COLOR : FAIL_COLOR }}
                        >
                          {overallPassed ? "Pass" : "Fail"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{overall?.rank ?? "—"}</td>
                  </tr>
                );
              })}
              {studentOrder.length === 0 ? (
                <tr><td colSpan={subjectList.length + 5} className="px-4 py-6 text-center text-zinc-500">
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

interface ExaminationMarksMatrixCell { marks: string | null; isAbsent: boolean; ce: MatrixCeCell[] }
