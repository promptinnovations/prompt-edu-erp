import { getAcademicInsights } from "../../../../../modules/portal/student-insights";
import { requireOwnStudentId, NotLinkedNotice } from "../_lib";
import AcademicsView from "../../../../components/portal/student/AcademicsView";

/** Academics (sidebar "Academics") — §Student-portal-visual-redesign.
 *  Every PUBLISHED exam (unpublished results never reach the portal):
 *  progress line, subject-wise bars against the previous exam, strengths
 *  radar, grade distribution, subject × exam mastery table, exam cards
 *  linking to each report card, daily assessments and the consolidated
 *  score. Visuals: app/components/portal/student/AcademicsView.tsx. */
export default async function StudentExamsPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;
  const data = await getAcademicInsights(institutionId, authUserId, ownStudentId);
  return <AcademicsView data={data} reportCardHref={(id) => `/portal/student/exams/${id}`} />;
}
