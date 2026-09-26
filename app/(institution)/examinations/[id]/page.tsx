import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { listClasses, listSections, listSubjects, listClassSubjects } from "../../../../modules/academic/service";
import {
  getExamination, listExamSubjects, listExamClasses, getResults, listExamTypes,
  listDailyAssessments, getDailyAssessmentConsolidatedResult,
  getDailyAssessmentSubjectAnalysis, getDailyAssessmentClassAnalysis, getDailyAssessmentStudentAnalysis,
} from "../../../../modules/examination/service";
import { ExamScopeSection, ExamSubjectsSection, ComputeResultsButton } from "./ExamDetailForms";
import DailyAssessmentSection from "./DailyAssessmentSection";

export default async function ExaminationDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ classId?: string; subjectId?: string }>;
}) {
  const { id } = await params;
  const { classId: classParam, subjectId: subjectParam } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound(); // RLS-guaranteed null across institutions (§E.3)

  const examTypes = await listExamTypes(institutionId, authUserId);
  const examType = examTypes.find((t) => t.id === examination.exam_type_id);

  // §Daily Assessment "integrated directly into the existing Exam Create ->
  // Exam Type workflow" -- an examination created under the Daily
  // Assessment exam type gets a completely different detail view (the
  // monthly register + consolidated result + analysis) instead of the
  // standard scope/subjects/results sections below, which don't fit its
  // per-day, per-class, per-subject shape (see migration 0048's doc
  // comment for why).
  if (examType?.is_daily_assessment) {
    const [classes, subjects, classSubjects, entries] = await Promise.all([
      listClasses(institutionId, authUserId),
      listSubjects(institutionId, authUserId),
      listClassSubjects(institutionId, authUserId),
      listDailyAssessments(institutionId, authUserId, id, undefined),
    ]);
    const subjectsByClass: Record<string, Array<{ id: string; name: string }>> = {};
    for (const cs of classSubjects) {
      const list = subjectsByClass[cs.class_id] ?? [];
      list.push({ id: cs.subject_id, name: cs.subject_name });
      subjectsByClass[cs.class_id] = list;
    }
    const allSubjects = subjects.map((s) => ({ id: s.id, name: s.name }));
    const classOptions = classes.map((c) => ({ id: c.id, name: c.name }));

    const [consolidated, subjectAnalysis, classAnalysis, studentAnalysis] = await Promise.all([
      classParam ? getDailyAssessmentConsolidatedResult(institutionId, authUserId, id, classParam, subjectParam || undefined) : Promise.resolve([]),
      getDailyAssessmentSubjectAnalysis(institutionId, authUserId, id),
      getDailyAssessmentClassAnalysis(institutionId, authUserId, id),
      classParam ? getDailyAssessmentStudentAnalysis(institutionId, authUserId, id, classParam) : Promise.resolve([]),
    ]);

    return (
      <div className="space-y-6">
        <Link href="/examinations" className="text-sm text-zinc-500 underline">
          ← Back to examinations
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-[var(--heading)]">{examination.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">Daily Assessment · {examination.status}</p>
        </div>
        <DailyAssessmentSection
          examinationId={id}
          canManage={can(ctx.permissions, "marks.enter")}
          classes={classOptions}
          subjectsByClass={subjectsByClass}
          allSubjects={allSubjects}
          entries={entries}
          classParam={classParam ?? ""}
          subjectParam={subjectParam ?? ""}
          consolidated={consolidated}
          subjectAnalysis={subjectAnalysis}
          classAnalysis={classAnalysis}
          studentAnalysis={studentAnalysis}
        />
      </div>
    );
  }

  const [examSubjects, examClasses, subjects, classes, sections, results, classSubjects] = await Promise.all([
    listExamSubjects(institutionId, authUserId, id),
    listExamClasses(institutionId, authUserId, id),
    listSubjects(institutionId, authUserId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    getResults(institutionId, authUserId, id),
    listClassSubjects(institutionId, authUserId),
  ]);

  const subjectById = new Map(subjects.map((s) => [s.id, s.name]));
  const examTypeName = examType?.name ?? "—";

  // §CS.2 "exam creation is solely done by admin" -- confirming scope
  // and adding/removing subjects are settings.manage-gated server actions
  // already (see actions.ts), but this page rendered the admin forms
  // unconditionally, so a teacher without settings.manage would see (and
  // could submit, only to get a server-side permission error) the
  // "Confirm scope" checkboxes and "Add subject"/"Remove" controls. Gate
  // the forms themselves on the same permission the actions already
  // require, so a teacher only ever sees the read-only "already linked"
  // tables (still needed for the Enter marks links).
  const canManage = can(ctx.permissions, "settings.manage");

  // §CS.1 "are the subjects allocated class wise?" -- the add-subject
  // checklist below used to offer every subject in the institution
  // regardless of the exam's confirmed classes, which is how a Class 1
  // exam ended up offering Class 11-only subjects like Fiqh. Narrow it to
  // subjects actually taught (per class_subjects) by at least one of this
  // exam's scoped classes -- same class_subjects gate getMarksGrid() and
  // getMarkEntryStatus() apply server-side, and same fallback: a class with
  // zero class_subjects rows configured at all doesn't narrow anything (so
  // institutions that haven't set up class_subjects keep seeing every
  // subject, same as before this fix).
  const subjectIdsByClass = new Map<string, Set<string>>();
  for (const cs of classSubjects) {
    const set = subjectIdsByClass.get(cs.class_id) ?? new Set<string>();
    set.add(cs.subject_id);
    subjectIdsByClass.set(cs.class_id, set);
  }
  const scopedClassIds = [...new Set(examClasses.map((ec) => ec.class_id))];
  const hasUnconfiguredScopedClass = scopedClassIds.some((cid) => !subjectIdsByClass.has(cid));
  const eligibleSubjects = scopedClassIds.length === 0 || hasUnconfiguredScopedClass
    ? subjects
    : subjects.filter((s) => scopedClassIds.some((cid) => subjectIdsByClass.get(cid)?.has(s.id)));

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
      <Link href="/examinations" className="text-sm text-zinc-500 underline">
        ← Back to examinations
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-[var(--heading)]">{examination.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">{examTypeName} · {examination.status}</p>
      </div>

      {canManage ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">1. Confirm scope</h2>
          <p className="mb-3 text-xs text-zinc-500">Which grades and divisions does this exam apply to?</p>
          <ExamScopeSection examinationId={id} classGroups={classGroups} linked={linkedClasses} />
        </section>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">{canManage ? "2. Subjects & total marks" : "Subjects & total marks"}</h2>
        <p className="mb-3 text-xs text-zinc-500">
          {canManage
            ? "Total mark, subject wise — check the subjects this exam covers and set each one's max/pass marks."
            : "Subjects this exam covers — open a subject to enter marks for your class."}
        </p>
        <ExamSubjectsSection examinationId={id} subjects={eligibleSubjects} linked={linkedSubjects} canManage={canManage} />
      </section>

      <section className="rounded-card border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--heading)]">Results</h2>
          <ComputeResultsButton examinationId={id} />
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Total</th>
              <th className="py-1.5">%</th>
              <th className="py-1.5">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map((r) => (
              <tr key={r.student_id}>
                <td className="py-1.5">{r.student_name}</td>
                <td className="py-1.5">{r.total_marks} / {r.max_total_marks}</td>
                <td className="py-1.5">{Number(r.percentage).toFixed(2)}%</td>
                <td className="py-1.5">{r.grade_label ?? "—"}</td>
              </tr>
            ))}
            {results.length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-center text-zinc-500">No results computed yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
