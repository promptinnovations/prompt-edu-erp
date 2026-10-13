import { notFound } from "next/navigation";
import { requireOwnStudentId, NotLinkedNotice } from "../../../_lib";
import { getDailyAssessmentMonthDetail } from "../../../../../../../modules/portal/student-insights";
import DailyAssessmentMonthView from "../../../../../../components/portal/student/DailyAssessmentMonthView";

/** §Portal-daily-assessment-detail — one Daily Assessment month in full
 *  (opened from its chip on Academics): the student's own tests only, and
 *  only for a register published to the portal; anything else 404s. */
export default async function StudentDailyAssessmentMonthPage({ params }: { params: Promise<{ examinationId: string }> }) {
  const { examinationId } = await params;
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;
  const data = await getDailyAssessmentMonthDetail(institutionId, authUserId, ownStudentId, examinationId);
  if (!data) notFound();
  return <DailyAssessmentMonthView data={data} backHref="/portal/student/exams" />;
}
