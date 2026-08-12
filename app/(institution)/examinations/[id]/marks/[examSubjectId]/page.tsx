import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { can } from "../../../../../../services/permissions/permission-service";
import { getExamination, listExamSubjects, getMarksGrid } from "../../../../../../modules/examination/service";
import { listSubjects } from "../../../../../../modules/academic/service";
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

  const [examSubjects, subjects, grid] = await Promise.all([
    listExamSubjects(institutionId, authUserId, id),
    listSubjects(institutionId, authUserId),
    getMarksGrid(institutionId, authUserId, examSubjectId),
  ]);
  const examSubject = examSubjects.find((es) => es.id === examSubjectId);
  if (!examSubject) notFound();
  const subjectName = subjects.find((s) => s.id === examSubject.subject_id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <Link href={`/examinations/${id}`} className="text-sm text-zinc-500 underline">
        ← Back to {examination.name}
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900">
        {subjectName} — marks entry
      </h1>
      <p className="text-sm text-zinc-500">Max {examSubject.max_marks}, pass {examSubject.pass_marks}</p>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <MarksGridForm
          students={grid}
          examinationId={id}
          examSubjectId={examSubjectId}
          canEnter={can(ctx.permissions, "marks.enter")}
          canVerify={can(ctx.permissions, "marks.verify")}
          canApprove={can(ctx.permissions, "marks.approve")}
          canLock={can(ctx.permissions, "marks.lock")}
        />
      </section>
    </div>
  );
}
