import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { can } from "../../../../../../services/permissions/permission-service";
import { getTeacherClassScope } from "../../../../../../services/scope/teacher-scope-service";
import { getInstitution, institutionReportName } from "../../../../../../services/institution/institution-service";
import { listClasses, listSections } from "../../../../../../modules/academic/service";
import PrintButton from "../../../../../components/PrintButton";
import ReportCardDocument from "../ReportCardDocument";
import { loadReportCards } from "../report-card-data";

/** §Print-center-class-grid ("if clicked, it will open all report cards of
 *  that class") — every report card for one class (optionally one
 *  division) stacked on a single page, one per printed sheet
 *  (`print:break-after-page` on all but the last), so a class teacher
 *  prints a whole set with one Ctrl-P instead of opening forty URLs.
 *
 *  Content comes from the same loadReportCards() the single-card route
 *  uses, so a sheet printed from here is identical to the one printed
 *  from that student's own page — including for a Daily Assessment
 *  register, which builds its rows from the month's daily marks. */
export default async function PrintAllReportCardsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ classId?: string; sectionId?: string }>;
}) {
  const { id } = await params;
  const { classId = "", sectionId = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const hasBroadResultAccess = ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || can(ctx.permissions, "settings.manage");
  const teacherScope = hasBroadResultAccess ? null : await getTeacherClassScope(institutionId, authUserId, ctx.userId);
  // A class outside the viewer's own scope is refused outright rather than
  // silently widened to "every class they can see".
  if (classId && teacherScope && !teacherScope.classIds.has(classId)) notFound();

  const [institution, classes, sections, loaded] = await Promise.all([
    getInstitution(institutionId, authUserId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    loadReportCards(institutionId, authUserId, id, {
      classId: classId || null,
      sectionId: sectionId || null,
      allowedClassIds: teacherScope ? [...teacherScope.classIds] : null,
    }),
  ]);
  if (!loaded) notFound();

  const className = classes.find((c) => c.id === classId)?.name ?? null;
  const sectionName = sections.find((s) => s.id === sectionId)?.name ?? null;
  // getExaminationMarksMatrix can't filter by section, so narrow here.
  const cards = sectionName ? loaded.cards.filter((c) => c.section_name === sectionName) : loaded.cards;
  const scopeLabel = className ? `${className}${sectionName ? ` - ${sectionName}` : ""}` : "all classes";

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/results/${id}/report-cards`} className="text-sm text-zinc-500 underline">
            ← Back to report cards
          </Link>
          <p className="mt-1 text-sm text-zinc-600">
            {cards.length} report card{cards.length === 1 ? "" : "s"} for {scopeLabel} — {loaded.context.examinationName}.
            Each prints on its own sheet.
          </p>
        </div>
        <PrintButton label="Print all" />
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No report cards to print for {scopeLabel} — no marks have been recorded for this examination yet.
        </p>
      ) : null}

      <div className="space-y-6 print:space-y-0">
        {cards.map((card, i) => (
          <ReportCardDocument
            key={card.student_id}
            card={card}
            context={loaded.context}
            institutionName={institutionReportName(institution)}
            logoCode={institution?.logoFileId ? institution.code : null}
            breakAfter={i < cards.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
