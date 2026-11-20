import { requireOwnStudentId, NotLinkedNotice } from "../_lib";
import { can } from "../../../../../services/permissions/permission-service";
import { requireModuleEnabledOrRedirect } from "../../../../../services/modules/module-service";
import { getStudentEventsView } from "../../../../../modules/events/service";
import { PageHeader } from "../../../../components/portal/viz/blocks";
import { decorColor } from "../../../../components/portal/viz/palette";
import EventsView from "../../../../components/portal/EventsView";
import { selfEnrolAction, selfWithdrawAction } from "./actions";

/** Student → Events & houses (Events & Activities module, migration 0070). */
export default async function StudentEventsPage() {
  const { ctx, institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "events");
  if (!ownStudentId) return <NotLinkedNotice />;
  const view = await getStudentEventsView(institutionId, authUserId, ownStudentId);
  const self = can(ctx.permissions, "events.enrol_self");
  return (
    <div className="space-y-6">
      <PageHeader title="Events & houses" subtitle="Your house, the competitions you are in, and your results." icon="🏆" color={decorColor(1)} />
      <EventsView view={view} who="Your" enrol={self ? selfEnrolAction : undefined} withdraw={self ? selfWithdrawAction : undefined} />
    </div>
  );
}
