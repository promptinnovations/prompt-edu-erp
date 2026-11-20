import { requireOwnStudentId, NotLinkedNotice } from "../_lib";
import { listStudentHomework, getSyllabusProgress } from "../../../../../modules/homework/service";
import { PageHeader } from "../../../../components/portal/viz/blocks";
import { decorColor } from "../../../../components/portal/viz/palette";
import HomeworkView from "../../../../components/portal/HomeworkView";
import { tickOwnHomeworkAction } from "./actions";

/** Student → Homework & syllabus (migration 0072). */
export default async function StudentHomeworkPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;
  const [homework, syllabus] = await Promise.all([
    listStudentHomework(institutionId, authUserId, ownStudentId),
    getSyllabusProgress(institutionId, authUserId, ownStudentId),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Homework & syllabus" subtitle="What to do next, and how far each subject has got." icon="📝" color={decorColor(1)} />
      <HomeworkView homework={homework} syllabus={syllabus} tick={tickOwnHomeworkAction} />
    </div>
  );
}
