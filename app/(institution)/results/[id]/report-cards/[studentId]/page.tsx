import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { can } from "../../../../../../services/permissions/permission-service";
import { getTeacherClassScope } from "../../../../../../services/scope/teacher-scope-service";
import { getInstitution, institutionReportName } from "../../../../../../services/institution/institution-service";
import { getCurrentEnrollment } from "../../../../../../modules/students/service";
import PrintButton from "../../../../../components/PrintButton";
import ReportCardDocument from "../ReportCardDocument";
import { loadReportCards } from "../report-card-data";

/** "Result > Report Cards" — one student's printable Report Card.
 *
 *  §Report-card-print-all refactor: the document itself now lives in
 *  ReportCardDocument.tsx and its content is assembled by
 *  loadReportCards() (report-card-data.ts), both shared with the
 *  whole-class print route — so "print one" and "print the class" can
 *  never render different cards. Everything the old inline version did
 *  (TE / Total TE / CE / Total CE / Grade / Descriptor columns resolved
 *  against the exam's own grade scale, the identity block, the
 *  total/percentage/grade/attendance summary, signature blocks, the
 *  single-page print frame) moved there verbatim.
 *
 *  §Daily-assessment-report-card: a Daily Assessment monthly register has
 *  no exam_subjects/marks/results at all, so loadReportCards() builds its
 *  rows from that month's daily_assessment_marks instead — the "cumulative
 *  report card of that child of that month". Nothing here needs to know
 *  which kind it is. */
export default async function ReportCardPage({ params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { id, studentId } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  // §"give access to ... report cards of only their assigned classes not
  // all" — a teacher hitting this URL directly for a student outside their
  // scope must 404, not just have the link hidden on the list page.
  const hasBroadResultAccess = ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || can(ctx.permissions, "settings.manage");
  const teacherScope = hasBroadResultAccess ? null : await getTeacherClassScope(institutionId, authUserId, ctx.userId);
  if (teacherScope) {
    const enrollment = await getCurrentEnrollment(institutionId, authUserId, studentId);
    if (!enrollment || !teacherScope.classIds.has(enrollment.class_id)) notFound();
  }

  const [institution, loaded] = await Promise.all([
    getInstitution(institutionId, authUserId),
    loadReportCards(institutionId, authUserId, id, {
      studentIds: [studentId],
      allowedClassIds: teacherScope ? [...teacherScope.classIds] : null,
    }),
  ]);
  if (!loaded) notFound();
  const card = loaded.cards[0];
  if (!card) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/results/${id}/report-cards`} className="no-print text-sm text-zinc-500 underline">
        ← Back to report cards
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
