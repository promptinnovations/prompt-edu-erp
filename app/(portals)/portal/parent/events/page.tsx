import { requireOwnParentContext, NotLinkedNotice } from "../_lib";
import { requireModuleEnabledOrRedirect } from "../../../../../services/modules/module-service";
import { getStudentEventsView } from "../../../../../modules/events/service";
import ChildPicker from "../ChildPicker";
import { PageHeader } from "../../../../components/portal/viz/blocks";
import { decorColor } from "../../../../components/portal/viz/palette";
import EventsView from "../../../../components/portal/EventsView";

/** Parent → Events & houses: the selected child's house, entries and
 *  published results (Events & Activities module, migration 0070). */
export default async function ParentEventsPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "events");
  if (!selectedChildId) return <NotLinkedNotice />;
  const view = await getStudentEventsView(institutionId, authUserId, selectedChildId);
  return (
    <div className="space-y-6">
      <PageHeader title="Events & houses" subtitle="Your child's house, competitions and results." icon="🏆" color={decorColor(1)}>
        <ChildPicker options={children} selectedChildId={selectedChildId} />
      </PageHeader>
      <EventsView view={view} who="Their" />
    </div>
  );
}
