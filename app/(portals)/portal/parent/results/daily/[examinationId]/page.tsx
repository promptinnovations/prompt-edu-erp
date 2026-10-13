import Link from "next/link";
import { getParentPortalSections } from "../../../../../../../services/institution/institution-service";
import { getDailyAssessmentMonthDetail } from "../../../../../../../modules/portal/student-insights";
import { requireOwnParentContext, NotLinkedNotice, NotEnabledNotice } from "../../../_lib";
import ChildPicker from "../../../ChildPicker";
import DailyAssessmentMonthView from "../../../../../../components/portal/student/DailyAssessmentMonthView";

/** Parent mirror of /portal/student/exams/daily/[examinationId] —
 *  §Portal-daily-assessment-detail, for the selected child (one of the
 *  parent's own children only), behind the same "results" section switch
 *  as the parent's Academics page. */
export default async function ParentDailyAssessmentMonthPage({
  params, searchParams,
}: {
  params: Promise<{ examinationId: string }>;
  searchParams: Promise<{ childId?: string }>;
}) {
  const { examinationId } = await params;
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const sections = await getParentPortalSections(institutionId, authUserId);
  if (!sections.results) return <NotEnabledNotice what="Exam results" />;
  const data = await getDailyAssessmentMonthDetail(institutionId, authUserId, selectedChildId, examinationId);
  // Switching to another child keeps this URL: that child may have no tests
  // in this register (another class), so say so rather than a 404.
  if (!data) {
    return (
      <div className="space-y-4">
        <ChildPicker options={children} selectedChildId={selectedChildId} />
        <p className="rounded-card border bg-white p-5 text-sm text-zinc-600">
          No daily assessment results for this child in that month.{" "}
          <Link href={`/portal/parent/results?childId=${selectedChildId}`} className="font-medium text-[var(--brand)] underline">Back to Academics</Link>
        </p>
      </div>
    );
  }
  return (
    <DailyAssessmentMonthView
      data={data}
      backHref={`/portal/parent/results?childId=${selectedChildId}`}
      headerExtra={<ChildPicker options={children} selectedChildId={selectedChildId} />}
    />
  );
}
