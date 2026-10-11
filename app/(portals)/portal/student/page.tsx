import { getStudentProfile, listParentsForStudent, type ParentLinkRow } from "../../../../modules/students/service";
import { getDashboardInsights } from "../../../../modules/portal/student-insights";
import { requireOwnStudentId, NotLinkedNotice } from "./_lib";
import StarOfTheMonthBanner from "../../../components/StarOfTheMonthBanner";
import { StudentDetailsCard } from "../../../components/portal/ProfileSections";
import PortalPhotoUploader from "../../../components/portal/PortalPhotoUploader";
import DashboardView from "../../../components/portal/student/DashboardView";
import { uploadOwnPhotoAction } from "./actions";

/** Dashboard — §Student-portal-visual-redesign. "At a glance" + "take
 *  action": one headline per area (each tile opens that area's page, where
 *  the detail and the charts live), what's coming up, the to-do list,
 *  kudos and personal details. Nothing here repeats another page's charts
 *  or lists — see app/components/portal/student/DashboardView.tsx. */
export default async function StudentDashboardPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [profile, insights, parents] = await Promise.all([
    getStudentProfile(institutionId, authUserId, ownStudentId),
    getDashboardInsights(institutionId, authUserId, ownStudentId),
    listParentsForStudent(institutionId, authUserId, ownStudentId).catch(() => [] as ParentLinkRow[]),
  ]);
  if (!profile) return <NotLinkedNotice />;
  const firstName = profile.full_name.trim().split(/\s+/)[0] ?? profile.full_name;
  const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  return (
    <DashboardView
      firstName={titleCase(firstName)}
      fullName={profile.full_name}
      admissionNumber={profile.admission_number}
      insights={insights}
      banner={<StarOfTheMonthBanner institutionId={institutionId} authUserId={authUserId} />}
      photo={
        <PortalPhotoUploader
          photoFileId={profile.photo_file_id ?? null}
          name={profile.full_name}
          action={uploadOwnPhotoAction}
        />
      }
      details={<StudentDetailsCard student={profile} classLabel={insights.classLabel} rollNumber={insights.rollNumber} guardian={parents[0] ?? null} />}
    />
  );
}
