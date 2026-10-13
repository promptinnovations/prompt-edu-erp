import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnStudentId, NotLinkedNotice } from "../../_lib";
import { getExamination } from "../../../../../../modules/examination/service";
import { getInstitution, institutionReportName } from "../../../../../../services/institution/institution-service";
import PrintButton from "../../../../../components/PrintButton";
import ReportCardDocument from "../../../../../(institution)/results/[id]/report-cards/ReportCardDocument";
import { loadReportCards } from "../../../../../(institution)/results/[id]/report-cards/report-card-data";

/** The student's own report card for one examination.
 *
 *  §Portal-report-card ("Progress Report card in the student portal must
 *  be the same Report card we have in Print Center"): this used to be a
 *  separate, simpler "Progress Report" layout. It now renders the exact
 *  document staff print — ReportCardDocument fed by loadReportCards(), the
 *  same pair the Print Center's single-student and whole-class routes use
 *  — so the student sees, and can print, the identical one-page A4 card
 *  (TE/CE/Grade/Descriptor columns, summary, attendance, the class
 *  teacher's remark, signatures).
 *
 *  Scope and gate are unchanged: only the signed-in student's own card
 *  (studentIds: [ownStudentId]), and only once the examination has been
 *  published to the portal (examination.published_at) — an unpublished
 *  exam 404s exactly as before. */
export default async function StudentExamDetailPage({ params }: { params: Promise<{ examinationId: string }> }) {
  const { examinationId } = await params;
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const examination = await getExamination(institutionId, authUserId, examinationId);
  if (!examination || !examination.published_at) notFound();

  const [institution, loaded] = await Promise.all([
    getInstitution(institutionId, authUserId),
    loadReportCards(institutionId, authUserId, examinationId, { studentIds: [ownStudentId] }),
  ]);
  const card = loaded?.cards[0];
  if (!loaded || !card) notFound();

  return (
    <div className="space-y-4">
      <Link href="/portal/student/exams" className="no-print text-sm text-zinc-500 underline">
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
