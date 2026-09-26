import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { listClasses, listSubjects, listClassSubjects } from "../../../../modules/academic/service";
import {
  getExamination, listExamSubjects, getResults, listExamTypes,
  listDailyAssessments, getDailyAssessmentConsolidatedResult,
  getDailyAssessmentSubjectAnalysis, getDailyAssessmentClassAnalysis, getDailyAssessmentStudentAnalysis,
  listCeComponents, getExamScopePlan, listExamSubjectGrades, getExamSubjectClassIds,
  DEFAULT_OVERALL_PASS_PCT, PASS_COLOR, FAIL_COLOR,
} from "../../../../modules/examination/service";
import { getTeacherClassScope, scopeIncludesSubjectInClass } from "../../../../services/scope/teacher-scope-service";
import { formatMarks } from "../../../../services/format/marks";
import { ExamScopePlanner, ExamSubjectsSection } from "./ExamDetailForms";
import { ExamResultSettingsForm, CeComponentsForm, FinalizeResultsButton } from "./ExamResultSettings";
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

  // §CS.2 "exam creation is solely done by admin" -- the scope planner and
  // subject Remove are settings.manage-gated server actions; a teacher only
  // sees the read-only subjects table (with its Enter marks links).
  const canManage = can(ctx.permissions, "settings.manage");

  // §Teacher-access follow-up: "a teacher should see only their respective
  // class and subjects to enter marks in their portal not all school wide
  // classes and subjects" -- the subjects list and Results table below were
  // both previously unfiltered for anyone reaching this page. A teacher's
  // own scope (teacher_assignments, current academic year) is resolved
  // once here and used to filter both.
  const teacherScope = canManage ? null : await getTeacherClassScope(institutionId, authUserId, ctx.userId);

  const [examSubjects, subjects, ceComponents, subjectGrades, scopePlan] = await Promise.all([
    listExamSubjects(institutionId, authUserId, id),
    listSubjects(institutionId, authUserId),
    listCeComponents(institutionId, authUserId, id),
    listExamSubjectGrades(institutionId, authUserId, id),
    canManage ? getExamScopePlan(institutionId, authUserId, id) : Promise.resolve(null),
  ]);
  const results = await getResults(
    institutionId, authUserId, id,
    teacherScope ? [...teacherScope.classIds] : null
  );
  const isFinalized = Boolean(examination.finalized_at);
  const ceMode = examination.ce_mode ?? "total";

  const subjectById = new Map(subjects.map((s) => [s.id, s.name]));
  const examTypeName = examType?.name ?? "—";

  let linkedSubjects = examSubjects.map((es) => ({
    examSubjectId: es.id,
    subjectId: es.subject_id,
    name: subjectById.get(es.subject_id) ?? "—",
    maxMarks: es.max_marks,
    passMarks: es.pass_marks,
    grades: subjectGrades[es.id] ?? [],
  })).sort((a, b) => a.name.localeCompare(b.name));

  if (teacherScope) {
    const coveredClassIdsBySubject = await Promise.all(
      linkedSubjects.map((l) => getExamSubjectClassIds(institutionId, authUserId, l.examSubjectId))
    );
    linkedSubjects = linkedSubjects.filter((l, i) =>
      coveredClassIdsBySubject[i].some((classId) => scopeIncludesSubjectInClass(teacherScope, classId, l.subjectId))
    );
  }
  const provisionalCount = results.filter((r) => r.is_provisional).length;

  return (
    <div className="space-y-6">
      <Link href="/examinations" className="text-sm text-zinc-500 underline">
        ← Back to examinations
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-[var(--heading)]">{examination.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">{examTypeName} · {examination.status}</p>
      </div>

      {canManage && scopePlan ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">1. Scope &amp; subjects</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Section › Grade › Division. For each grade, tick only the subjects this exam covers — only those need marks.
          </p>
          <ExamScopePlanner key={examSubjects.map((e) => e.id).join(",") + String(results.length)} examinationId={id} plan={scopePlan} />
        </section>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">{canManage ? "2. Subjects & total marks" : "Subjects & total marks"}</h2>
        <p className="mb-3 text-xs text-zinc-500">
          {canManage
            ? "Each subject and the grades it is set for. Open a subject to enter marks."
            : "Subjects this exam covers — open a subject to enter marks for your class."}
        </p>
        <ExamSubjectsSection examinationId={id} linked={linkedSubjects} canManage={canManage} />
      </section>

      {canManage ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">3. Result rules &amp; Continuous Evaluation</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Overall pass = no failed subject and overall % at or above the threshold. CE marks count toward each subject exactly like the written paper.
          </p>
          <ExamResultSettingsForm
            examinationId={id}
            overallPassPct={examination.overall_pass_pct ?? null}
            defaultPassPct={DEFAULT_OVERALL_PASS_PCT}
            ceEnabled={Boolean(examination.ce_enabled)}
            ceMode={ceMode}
            disabled={isFinalized}
          />
          {examination.ce_enabled && linkedSubjects.length > 0 ? (
            <div className="mt-4 space-y-2 border-t pt-4">
              <p className="text-xs text-zinc-500">
                {ceMode === "total" ? "CE maximum per subject." : "CE parts per subject — their maxima add up to the subject's CE maximum."}
              </p>
              {linkedSubjects.map((l) => (
                <CeComponentsForm
                  key={`${l.examSubjectId}:${ceMode}`}
                  examinationId={id}
                  examSubjectId={l.examSubjectId}
                  subjectName={l.name}
                  mode={ceMode}
                  components={ceComponents.filter((c) => c.exam_subject_id === l.examSubjectId).map((c) => ({ name: c.name, maxMarks: c.max_marks }))}
                  disabled={isFinalized}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--heading)]">
            Results{isFinalized ? " — finalized (frozen)" : ""}
          </h2>
          {!isFinalized && provisionalCount > 0 ? (
            <p className="w-full text-xs text-zinc-500 sm:w-auto">
              Live: {provisionalCount} provisional (marks still being entered or not yet verified/locked). Verifying, locking and finalizing can be done later.
            </p>
          ) : null}
          {canManage && can(ctx.permissions, "marks.lock") && !isFinalized ? <FinalizeResultsButton examinationId={id} /> : null}
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Total</th>
              <th className="py-1.5">%</th>
              <th className="py-1.5">Grade</th>
              <th className="py-1.5">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map((r) => (
              <tr key={r.student_id}>
                <td className="py-1.5">{r.student_name}</td>
                <td className="py-1.5">{formatMarks(r.total_marks)} / {formatMarks(r.max_total_marks)}</td>
                <td className="py-1.5">{Number(r.percentage).toFixed(2)}%</td>
                <td className="py-1.5">{r.grade_label ?? "—"}</td>
                <td className="py-1.5">
                  {r.is_pass == null ? "—" : (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: r.is_pass ? PASS_COLOR : FAIL_COLOR }}>
                      {r.is_pass ? "Pass" : "Fail"}
                    </span>
                  )}
                  {r.absent_subject_count > 0 ? <span className="ml-1 text-xs text-zinc-500">({r.absent_subject_count} absent)</span> : null}
                  {r.is_provisional ? <span className="ml-1 text-xs text-amber-700">Provisional ({r.subjects_entered}/{r.subjects_expected})</span> : null}
                </td>
              </tr>
            ))}
            {results.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-zinc-500">No results computed yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
