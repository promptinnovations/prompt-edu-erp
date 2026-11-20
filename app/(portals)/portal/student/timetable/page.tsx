import { requireOwnStudentId, NotLinkedNotice } from "../_lib";
import { requireModuleEnabledOrRedirect } from "../../../../../services/modules/module-service";
import { PageHeader } from "../../../../components/portal/viz/blocks";
import { decorColor } from "../../../../components/portal/viz/palette";
import ClassTimetable from "../../../../components/portal/ClassTimetable";

/** Student → Timetable: their class's weekly timetable. */
export default async function StudentTimetablePage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "substitution");
  if (!ownStudentId) return <NotLinkedNotice />;
  return (
    <div className="space-y-6">
      <PageHeader title="Timetable" subtitle="Your class's periods for the week." icon="🗓️" color={decorColor(0)} />
      <ClassTimetable institutionId={institutionId} authUserId={authUserId} studentId={ownStudentId} />
    </div>
  );
}
