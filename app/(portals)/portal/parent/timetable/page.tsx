import { requireOwnParentContext, NotLinkedNotice } from "../_lib";
import { requireModuleEnabledOrRedirect } from "../../../../../services/modules/module-service";
import ChildPicker from "../ChildPicker";
import { PageHeader } from "../../../../components/portal/viz/blocks";
import { decorColor } from "../../../../components/portal/viz/palette";
import ClassTimetable from "../../../../components/portal/ClassTimetable";

/** Parent → Timetable: the selected child's class timetable. */
export default async function ParentTimetablePage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "substitution");
  if (!selectedChildId) return <NotLinkedNotice />;
  return (
    <div className="space-y-6">
      <PageHeader title="Timetable" subtitle="Your child's class periods for the week." icon="🗓️" color={decorColor(0)}>
        <ChildPicker options={children} selectedChildId={selectedChildId} />
      </PageHeader>
      <ClassTimetable institutionId={institutionId} authUserId={authUserId} studentId={selectedChildId} />
    </div>
  );
}
