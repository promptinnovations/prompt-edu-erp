import { can } from "../../../../services/permissions/permission-service";
import { getParentPortalSections } from "../../../../services/institution/institution-service";
import { getStudentProfile, listParentsForStudent, type ParentLinkRow } from "../../../../modules/students/service";
import { getDashboardInsights } from "../../../../modules/portal/student-insights";
import { listLeaveApplicationsForStudent } from "../../../../modules/attendance/service";
import { listStudentFeeInvoices } from "../../../../modules/fees/service";
import { listDisciplineRecords } from "../../../../modules/discipline/service";
import { daysAgoIST, todayIST } from "../../../../services/datetime/ist";
import { requireOwnParentContext, NotLinkedNotice } from "./_lib";
import ChildPicker from "./ChildPicker";
import StarOfTheMonthBanner from "../../../components/StarOfTheMonthBanner";
import { StudentDetailsCard } from "../../../components/portal/ProfileSections";
import PortalPhotoUploader from "../../../components/portal/PortalPhotoUploader";
import ParentDashboardView from "../../../components/portal/parent/ParentDashboardView";
import { uploadChildPhotoAction } from "./actions";

/** Parent dashboard — §Parent-portal-visual-redesign. The selected child's
 *  overview: one headline per area the school shares with parents (each
 *  opening that area's page), what needs the parent's attention (fees,
 *  leave replies, notes from school, library), quick actions, what's coming
 *  up and the child's details. Section toggles (Settings → parent portal
 *  sections) and the parent's permissions decide what appears.
 *
 *  The old single long page (every list and form stacked) is split: forms
 *  and detail now live on their own sidebar pages. */
export default async function ParentPortalPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { ctx, institutionId, authUserId, ownParentId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!ownParentId || !selectedChildId) return <NotLinkedNotice />;

  const sections = await getParentPortalSections(institutionId, authUserId);
  const show = {
    results: sections.results, attendance: sections.attendance, achievements: sections.achievements, library: sections.library,
    fees: can(ctx.permissions, "fees.pay_own"), leave: can(ctx.permissions, "attendance.leave.apply"),
    messages: can(ctx.permissions, "messages.send_to_staff"), kudos: can(ctx.permissions, "kudos.send"),
  };

  const [profile, insights, parents, invoices, leaves, discipline] = await Promise.all([
    getStudentProfile(institutionId, authUserId, selectedChildId),
    getDashboardInsights(institutionId, authUserId, selectedChildId),
    listParentsForStudent(institutionId, authUserId, selectedChildId).catch(() => [] as ParentLinkRow[]),
    show.fees ? listStudentFeeInvoices(institutionId, authUserId, { studentId: selectedChildId }) : Promise.resolve([]),
    show.leave ? listLeaveApplicationsForStudent(institutionId, authUserId, selectedChildId) : Promise.resolve([]),
    sections.discipline ? listDisciplineRecords(institutionId, authUserId, selectedChildId) : Promise.resolve([]),
  ]);
  if (!profile) return <NotLinkedNotice />;

  const today = todayIST();
  const open = invoices.filter((i) => i.status !== "waived" && Number(i.amount_due) > Number(i.amount_paid));
  const fees = show.fees ? {
    pendingCount: open.length,
    balance: open.reduce((s, i) => s + Number(i.amount_due) - Number(i.amount_paid), 0),
    overdueCount: open.filter((i) => i.due_date && i.due_date < today).length,
    nextDue: open.map((i) => i.due_date).filter((d): d is string => !!d && d >= today).sort()[0] ?? null,
  } : null;
  const since = daysAgoIST(30);
  const schoolNotes = discipline.filter((r) => !r.is_positive && r.date >= since).length;

  const first = profile.full_name.trim().split(/\s+/)[0] ?? profile.full_name;
  const childFirstName = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  const q = `?childId=${selectedChildId}`;

  return (
    <ParentDashboardView
      childName={profile.full_name}
      childFirstName={childFirstName}
      admissionNumber={profile.admission_number}
      insights={insights}
      banner={<StarOfTheMonthBanner institutionId={institutionId} authUserId={authUserId} />}
      photo={
        <PortalPhotoUploader
          key={selectedChildId}
          photoFileId={profile.photo_file_id ?? null}
          name={profile.full_name}
          action={uploadChildPhotoAction}
          studentId={selectedChildId}
        />
      }
      switcher={<ChildPicker options={children} selectedChildId={selectedChildId} tone="light" />}
      show={show}
      fees={fees}
      leavesPending={leaves.filter((l) => l.status === "pending").length}
      schoolNotes={schoolNotes}
      hrefs={{
        academics: `/portal/parent/results${q}`, attendance: `/portal/parent/attendance${q}`, achievements: `/portal/parent/portfolio${q}`,
        reading: `/portal/parent/reading${q}`, fees: `/portal/parent/fees${q}`, contact: `/portal/parent/contact${q}`, growth: `/portal/parent/growth${q}`,
      }}
      dailyMonthHref={(id) => `/portal/parent/results/daily/${id}${q}`}
      details={<StudentDetailsCard student={profile} classLabel={insights.classLabel} rollNumber={insights.rollNumber} guardian={parents[0] ?? null} />}
    />
  );
}
