import { getParentPortalSections } from "../../../../../services/institution/institution-service";
import { getAcademicInsights } from "../../../../../modules/portal/student-insights";
import { requireOwnParentContext, NotLinkedNotice, NotEnabledNotice } from "../_lib";
import ChildPicker from "../ChildPicker";
import AcademicsView from "../../../../components/portal/student/AcademicsView";

/** Parent → Academics — §Parent-portal-visual-redesign. The same visual
 *  Academics page the student sees (published exams only), for the selected
 *  child, each exam card opening its report card. */
export default async function ParentResultsPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const sections = await getParentPortalSections(institutionId, authUserId);
  if (!sections.results) return <NotEnabledNotice what="Exam results" />;
  const data = await getAcademicInsights(institutionId, authUserId, selectedChildId);
  return (
    <AcademicsView
      data={data}
      reportCardHref={(id) => `/portal/parent/results/${id}?childId=${selectedChildId}`}
      dailyHref={(id) => `/portal/parent/results/daily/${id}?childId=${selectedChildId}`}
      headerExtra={<ChildPicker options={children} selectedChildId={selectedChildId} />}
    />
  );
}
