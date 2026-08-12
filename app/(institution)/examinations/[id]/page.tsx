import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { listClasses, listSections, listSubjects } from "../../../../modules/academic/service";
import {
  getExamination, listExamSubjects, getResults, listExamTypes,
} from "../../../../modules/examination/service";
import { AddExamSubjectForm, AddExamClassForm, ComputeResultsButton } from "./ExamDetailForms";

export default async function ExaminationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound(); // RLS-guaranteed null across institutions (§E.3)

  const [examSubjects, subjects, classes, sections, examTypes, results] = await Promise.all([
    listExamSubjects(institutionId, authUserId, id),
    listSubjects(institutionId, authUserId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listExamTypes(institutionId, authUserId),
    getResults(institutionId, authUserId, id),
  ]);

  const subjectById = new Map(subjects.map((s) => [s.id, s.name]));
  const classById = new Map(classes.map((c) => [c.id, c.name]));
  const sectionOptions = sections.map((s) => ({ id: s.id, classId: s.class_id, label: `${classById.get(s.class_id) ?? "?"} — ${s.name}` }));
  const examTypeName = examTypes.find((t) => t.id === examination.exam_type_id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <Link href="/examinations" className="text-sm text-zinc-500 underline">
        ← Back to examinations
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{examination.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">{examTypeName} · {examination.status}</p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Exam subjects</h2>
        <AddExamSubjectForm examinationId={id} subjects={subjects} />
        <ul className="mt-4 divide-y divide-zinc-100 text-sm">
          {examSubjects.map((es) => (
            <li key={es.id} className="flex items-center justify-between py-2">
              <span>{subjectById.get(es.subject_id) ?? "—"} (max {es.max_marks}, pass {es.pass_marks})</span>
              <Link href={`/examinations/${id}/marks/${es.id}`} className="text-sm text-zinc-600 underline">
                Enter marks
              </Link>
            </li>
          ))}
          {examSubjects.length === 0 ? <li className="py-2 text-zinc-400">—</li> : null}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Classes covered</h2>
        <AddExamClassForm examinationId={id} sections={sectionOptions} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">Results</h2>
          <ComputeResultsButton examinationId={id} />
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Total</th>
              <th className="py-1.5">%</th>
              <th className="py-1.5">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {results.map((r) => (
              <tr key={r.student_id}>
                <td className="py-1.5">{r.student_name}</td>
                <td className="py-1.5">{r.total_marks} / {r.max_total_marks}</td>
                <td className="py-1.5">{Number(r.percentage).toFixed(2)}%</td>
                <td className="py-1.5">{r.grade_label ?? "—"}</td>
              </tr>
            ))}
            {results.length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-center text-zinc-400">No results computed yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
