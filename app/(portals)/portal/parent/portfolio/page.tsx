import { getParentPortalSections } from "../../../../../services/institution/institution-service";
import { getActivityInsights } from "../../../../../modules/portal/student-insights";
import { requireOwnParentContext, NotLinkedNotice, NotEnabledNotice } from "../_lib";
import ChildPicker from "../ChildPicker";
import ActivitiesView from "../../../../components/portal/student/ActivitiesView";

/** Parent → Achievements & activities (route kept at /portfolio) —
 *  §Parent-portal-visual-redesign. Badges, awards by area and level,
 *  timeline, certificates and co-curricular activities for the selected
 *  child, gated by the achievements / skills sections. */
export default async function ParentPortfolioPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const s = await getParentPortalSections(institutionId, authUserId);
  if (!s.achievements && !s.skills) return <NotEnabledNotice what="Achievements" />;
  const data = await getActivityInsights(institutionId, authUserId, selectedChildId);
  return (
    <ActivitiesView
      data={{ achievements: s.achievements ? data.achievements : [], activities: s.skills ? data.activities : [] }}
      headerExtra={<ChildPicker options={children} selectedChildId={selectedChildId} />}
    />
  );
}
