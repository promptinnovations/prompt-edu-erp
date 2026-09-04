import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { listClasses, listSections, listSubjects } from "../../../../modules/academic/service";
import {
  getExamination, listExamSubjects, listExamClasses, getResults, listExamTypes,
} from "../../../../modules/examination/service";
import { ExamScopeSection, ExamSubjectsSection, ComputeResultsButton } from "./ExamDetailForms";

export default async function ExaminationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound(); // RLS-guaranteed null across institutions (§E.3)

  const [examSubjects, examClasses, subjects, classes, sections, examTypes, results] = await Promise.all([
    listExamSubjects(institutionId, authUserId, id),
    listExamClasses(institutionId, authUserId, id),
    listSubjects(institutionId, authUserId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listExamTypes(institutionId, authUserId),
    getResults(institutionId, authUserId, id),
  ]);

  const subjectById = new Map(subjects.map((s) => [s.id, s.name]));
  const examTypeName = examTypes.find((t) => t.id === examination.exam_type_id)?.name ?? "—";

  // §418 "confirm scope of exam, section, grade, division — make user
  // friendly": classes grouped with their own divisions, for the
  // checkbox-grid scope form (ExamScopeSection) — same grouping shape the
  // Classes hub redesign (§417) already introduced, reused here.
  const sectionsByClass = new Map<string, Array<{ sectionId: string; sectionName: string }>>();
  for (const s of sections) {
    const list = sectionsByClass.get(s.class_id) ?? [];
    list.push({ sectionId: s.id, sectionName: s.name });
    sectionsByClass.set(s.class_id, list);
  }
  const classGroups = classes.map((c) => ({
    classId: c.id,
    className: c.name,
    divisions: (sectionsByClass.get(c.id) ?? []).sort((a, b) => a.sectionName.localeCompare(b.sectionName)),
  }));

  const classById = new Map(classes.map((c) => [c.id, c.name]));
  const linkedClasses = examClasses.map((ec) => ({
    examClassId: ec.id,
    label: ec.section_id
      ? `Class ${classById.get(ec.class_id) ?? "?"} ${ec.section_name ?? ""}`.trim()
      : `Class ${classById.get(ec.class_id) ?? "?"} (whole class)`,
  }));

  const linkedSubjects = examSubjects.map((es) => ({
    examSubjectId: es.id,
    subjectId: es.subject_id,
    name: subjectById.get(es.subject_id) ?? "—",
    maxMarks: es.max_marks,
    passMarks: es.pass_marks,
  }));

  return (
    <div className="space-y-6">
      <Link href="/examinations" className="text-sm text-zinc-500 dark:text-zinc-400 underline">
        ← Back to examinations
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{examination.name}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{examTypeName} · {examination.status}</p>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">1. Confirm scope</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">Which grades and divisions does this exam apply to?</p>
        <ExamScopeSection examinationId={id} classGroups={classGroups} linked={linkedClasses} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">2. Subjects &amp; total marks</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">Total mark, subject wise — check the subjects this exam covers and set each one&apos;s max/pass marks.</p>
        <ExamSubjectsSection examinationId={id} subjects={subjects} linked={linkedSubjects} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Results</h2>
          <ComputeResultsButton examinationId={id} />
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Total</th>
              <th className="py-1.5">%</th>
              <th className="py-1.5">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {results.map((r) => (
              <tr key={r.student_id}>
                <td className="py-1.5">{r.student_name}</td>
                <td className="py-1.5">{r.total_marks} / {r.max_total_marks}</td>
                <td className="py-1.5">{Number(r.percentage).toFixed(2)}%</td>
                <td className="py-1.5">{r.grade_label ?? "—"}</td>
              </tr>
            ))}
            {results.length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No results computed yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
