import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { can } from "../../../../../../services/permissions/permission-service";
import { getExamination, getDailyAssessment, getDailyAssessmentMarksGrid } from "../../../../../../modules/examination/service";
import { getTeacherClassScope, scopeIncludesSubjectInClass } from "../../../../../../services/scope/teacher-scope-service";
import DailyMarksGridForm from "./DailyMarksGridForm";

export default async function DailyAssessmentMarksPage({
  params,
}: {
  params: Promise<{ id: string; assessmentId: string }>;
}) {
  const { id, assessmentId } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound();

  const entry = await getDailyAssessment(institutionId, authUserId, assessmentId);
  if (!entry || entry.examination_id !== id) notFound();

  // Same "teachers can give access only to their respective classes/
  // subjects" scoping the standard exam module's marks entry page uses
  // (§248) -- marks.approve is the institution-wide "unrestricted" signal;
  // anyone without it must actually teach this subject in this class.
  if (!can(ctx.permissions, "marks.approve")) {
    const scope = await getTeacherClassScope(institutionId, authUserId, ctx.userId);
    if (!scopeIncludesSubjectInClass(scope, entry.class_id, entry.subject_id)) notFound();
  }

  const grid = await getDailyAssessmentMarksGrid(institutionId, authUserId, assessmentId);
  const isToday = entry.assessment_date === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <Link href={`/examinations/${id}`} className="text-sm text-zinc-500 dark:text-zinc-400 underline">
        ← Back to {examination.name}
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {entry.subject_name} — {entry.class_name} — {new Date(entry.assessment_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Portion: {entry.portion}</p>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <DailyMarksGridForm
          students={grid}
          examinationId={id}
          dailyAssessmentId={assessmentId}
          canEnter={can(ctx.permissions, "marks.enter")}
          isToday={isToday}
          maxMarks={entry.max_marks}
        />
      </section>
    </div>
  );
}
