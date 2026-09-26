import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { can } from "../../../../../../services/permissions/permission-service";
import { getExamination, listExamSubjects, getMarksGrid, getCeMarksGrid } from "../../../../../../modules/examination/service";
import { listSubjects } from "../../../../../../modules/academic/service";
import { assertMarkEntryScope } from "../../../../../../services/scope/teacher-scope-service";
import MarksGridForm from "./MarksGridForm";

export default async function MarksEntryPage({
  params,
}: {
  params: Promise<{ id: string; examSubjectId: string }>;
}) {
  const { id, examSubjectId } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const examination = await getExamination(institutionId, authUserId, id);
  if (!examination) notFound();

  const [examSubjects, subjects] = await Promise.all([
    listExamSubjects(institutionId, authUserId, id),
    listSubjects(institutionId, authUserId),
  ]);
  const examSubject = examSubjects.find((es) => es.id === examSubjectId);
  if (!examSubject) notFound();
  const subjectName = subjects.find((s) => s.id === examSubject.subject_id)?.name ?? "—";

  // §CS.2 "teachers should have mark entry to their respective class
  // only" -- shared with every mark-writing server action (actions.ts) so
  // the rule lives in one place; a failed check hides the page (notFound())
  // rather than throwing, same behavior as before.
  try {
    await assertMarkEntryScope(institutionId, authUserId, ctx.userId, ctx.permissions, examSubjectId);
  } catch {
    notFound();
  }

  const [grid, ce] = await Promise.all([
    getMarksGrid(institutionId, authUserId, examSubjectId),
    getCeMarksGrid(institutionId, authUserId, examSubjectId),
  ]);
  const ceMax = ce.components.reduce((a, c) => a + Number(c.max_marks), 0);

  return (
    <div className="space-y-4">
      <Link href={`/examinations/${id}`} className="text-sm text-zinc-500 underline">
        ← Back to {examination.name}
      </Link>
      <h1 className="text-2xl font-semibold text-[var(--heading)]">
        {subjectName} — marks entry
      </h1>
      <p className="text-sm text-zinc-500">
        Max {examSubject.max_marks}, pass {examSubject.pass_marks}
        {ce.components.length > 0 ? ` · CE max ${ceMax} (${ce.components.map((c) => `${c.name} /${c.max_marks}`).join(", ")})` : ""}
        {examination.finalized_at ? " · Results finalized — marks are read-only" : ""}
      </p>

      <section className="rounded-card border bg-white p-5">
        <MarksGridForm
          students={grid}
          examinationId={id}
          examSubjectId={examSubjectId}
          ceComponents={ce.components.map((c) => ({ id: c.id, name: c.name, maxMarks: c.max_marks }))}
          ceMarks={ce.marks}
          canEnter={can(ctx.permissions, "marks.enter") && !examination.finalized_at}
          canVerify={can(ctx.permissions, "marks.verify")}
          canApprove={can(ctx.permissions, "marks.approve")}
          canLock={can(ctx.permissions, "marks.lock")}
        />
      </section>
    </div>
  );
}
