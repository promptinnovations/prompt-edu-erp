import { getGrowthInsights } from "../../../../../modules/portal/student-insights";
import { requireOwnStudentId, NotLinkedNotice } from "../_lib";
import GrowthView from "../../../../components/portal/student/GrowthView";

/** Growth & conduct — §Student-portal-visual-redesign. Character ratings
 *  (radar + growth line + per-quality indicators), the teacher's remark,
 *  strengths / areas to work on / goals, positive recognitions as badges
 *  and mentoring notes. Positive and developmental by design: negative
 *  discipline records are not shown to the student here.
 *  Visuals: app/components/portal/student/GrowthView.tsx. */
export default async function StudentGrowthPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;
  const data = await getGrowthInsights(institutionId, authUserId, ownStudentId);
  return <GrowthView data={data} />;
}
