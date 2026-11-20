import { requireOwnParentContext, NotLinkedNotice } from "../_lib";
import { listStudentHomework, getSyllabusProgress } from "../../../../../modules/homework/service";
import ChildPicker from "../ChildPicker";
import { PageHeader } from "../../../../components/portal/viz/blocks";
import { decorColor } from "../../../../components/portal/viz/palette";
import HomeworkView from "../../../../components/portal/HomeworkView";

/** Parent → Homework & syllabus: the child's homework with their done
 *  ticks, and the class's syllabus progress (migration 0072). */
export default async function ParentHomeworkPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const [homework, syllabus] = await Promise.all([
    listStudentHomework(institutionId, authUserId, selectedChildId),
    getSyllabusProgress(institutionId, authUserId, selectedChildId),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Homework & syllabus" subtitle="Your child's homework and how far each subject has got." icon="📝" color={decorColor(1)}>
        <ChildPicker options={children} selectedChildId={selectedChildId} />
      </PageHeader>
      <HomeworkView homework={homework} syllabus={syllabus} />
    </div>
  );
}
