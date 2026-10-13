import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnParentContext, NotLinkedNotice } from "../../_lib";
import { getExamination } from "../../../../../../modules/examination/service";
import { getInstitution, institutionReportName } from "../../../../../../services/institution/institution-service";
import PrintButton from "../../../../../components/PrintButton";
import ReportCardDocument from "../../../../../(institution)/results/[id]/report-cards/ReportCardDocument";
import { loadReportCards } from "../../../../../(institution)/results/[id]/report-cards/report-card-data";

/** Parent-portal mirror of app/(portals)/portal/student/exams/[examinationId]/page.tsx
 *  — §Portal-report-card: the same report card staff print from the Print
 *  Center (ReportCardDocument + loadReportCards), for whichever of the
 *  parent's own children is selected, gated the same way
 *  (examination.published_at must be set). */
export default async function ParentExamDetailPage({
  params, searchParams,
}: {
  params: Promise<{ examinationId: string }>;
  searchParams: Promise<{ childId?: string }>;
}) {
  const { examinationId } = await params;
  const { childId } = await searchParams;
  const { institutionId, authUserId, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;

  const examination = await getExamination(institutionId, authUserId, examinationId);
  if (!examination || !examination.published_at) notFound();

  const [institution, loaded] = await Promise.all([
    getInstitution(institutionId, authUserId),
    loadReportCards(institutionId, authUserId, examinationId, { studentIds: [selectedChildId] }),
  ]);
  const card = loaded?.cards[0];
  if (!loaded || !card) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/portal/parent/results?childId=${selectedChildId}`} className="no-print text-sm text-zinc-500 underline">
        ← Back to Academics
      </Link>
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>

      <ReportCardDocument
        card={card}
        context={loaded.context}
        institutionName={institutionReportName(institution)}
        logoCode={institution?.logoFileId ? institution.code : null}
      />
    </div>
  );
}
