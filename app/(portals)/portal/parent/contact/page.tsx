import { can } from "../../../../../services/permissions/permission-service";
import { listStaff } from "../../../../../modules/staff/service";
import { requireOwnParentContext, NotLinkedNotice, NotEnabledNotice } from "../_lib";
import ChildPicker from "../ChildPicker";
import SendMessageForm from "../SendMessageForm";
import SendKudosForm from "../SendKudosForm";
import { PageHeader, Panel } from "../../../../components/portal/viz/blocks";
import { CONTACT_COLOR } from "../../../../components/portal/parent/ParentDashboardView";
import { AREA } from "../../../../components/portal/student/areas";

/** Parent → Contact school — §Parent-portal-visual-redesign. Message a
 *  teacher or the principal about the selected child, and send a flower or
 *  congratulations to a teacher or the child. */
export default async function ParentContactPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { ctx, institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const canMessage = can(ctx.permissions, "messages.send_to_staff");
  const canKudos = can(ctx.permissions, "kudos.send");
  if (!canMessage && !canKudos) return <NotEnabledNotice what="Messaging the school" />;
  const staff = await listStaff(institutionId, authUserId);
  const child = children.find((c) => c.id === selectedChildId);
  return (
    <div className="space-y-6">
      <PageHeader title="Contact school" subtitle="Talk to teachers and share encouragement." icon="✉️" color={CONTACT_COLOR}>
        <ChildPicker options={children} selectedChildId={selectedChildId} />
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        {canMessage ? (
          <Panel title="Message a teacher or the principal" subtitle={`About ${child?.full_name ?? "your child"}.`} color={CONTACT_COLOR}>
            <SendMessageForm
              studentId={selectedChildId}
              staffOptions={staff.map((s) => ({ userId: s.user_id, label: `${s.full_name}${s.designation ? ` — ${s.designation}` : ""}` }))}
            />
          </Panel>
        ) : null}
        {canKudos ? (
          <div id="kudos" className="scroll-mt-6">
            <Panel title="Send a flower or congratulations 🌸" subtitle="A kind word for a teacher — or for your child." color={AREA.growth.color}>
              <SendKudosForm
                studentId={selectedChildId}
                studentName={child?.full_name ?? "your child"}
                staffOptions={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
              />
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  );
}
