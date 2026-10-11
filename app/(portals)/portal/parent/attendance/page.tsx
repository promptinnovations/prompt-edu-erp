import { can } from "../../../../../services/permissions/permission-service";
import { getParentPortalSections } from "../../../../../services/institution/institution-service";
import { getAttendanceInsights } from "../../../../../modules/portal/student-insights";
import { requireOwnParentContext, NotLinkedNotice, NotEnabledNotice } from "../_lib";
import ChildPicker from "../ChildPicker";
import ApplyLeaveForm from "../ApplyLeaveForm";
import AttendanceView from "../../../../components/portal/student/AttendanceView";
import { PageHeader } from "../../../../components/portal/viz/blocks";
import { AREA } from "../../../../components/portal/student/areas";

/** Parent → Attendance — §Parent-portal-visual-redesign. The visual
 *  attendance page for the selected child, with the apply-for-leave form
 *  (which also lists the applications) in place of the read-only list when
 *  the parent may apply. */
export default async function ParentAttendancePage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { ctx, institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const sections = await getParentPortalSections(institutionId, authUserId);
  const canLeave = can(ctx.permissions, "attendance.leave.apply");
  if (!sections.attendance && !canLeave) return <NotEnabledNotice what="Attendance" />;
  const data = await getAttendanceInsights(institutionId, authUserId, selectedChildId);
  const child = children.find((c) => c.id === selectedChildId);
  if (!sections.attendance) {
    // Attendance itself isn't shared with parents here — leave only.
    return (
      <div id="leave" className="space-y-6">
        <PageHeader title="Leave" subtitle="Apply for leave and see the school's replies." icon={AREA.attendance.icon} color={AREA.attendance.color}>
          <ChildPicker options={children} selectedChildId={selectedChildId} />
        </PageHeader>
        <ApplyLeaveForm studentId={selectedChildId} studentName={child?.full_name ?? "your child"} leaves={data.leaves} />
      </div>
    );
  }
  return (
    <AttendanceView
      data={data}
      headerExtra={<ChildPicker options={children} selectedChildId={selectedChildId} />}
      leaveSlot={canLeave ? (
        <div id="leave" className="scroll-mt-6">
          <ApplyLeaveForm studentId={selectedChildId} studentName={child?.full_name ?? "your child"} leaves={data.leaves} />
        </div>
      ) : undefined}
    />
  );
}
