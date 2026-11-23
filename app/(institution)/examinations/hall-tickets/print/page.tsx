import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../../services/modules/module-service";
import { can } from "../../../../../services/permissions/permission-service";
import { getInstitution, institutionReportName } from "../../../../../services/institution/institution-service";
import { buildHallTickets } from "../../../../../modules/examination/hall-ticket-service";
import PrintButton from "../../../../components/PrintButton";
import HallTicketDocument from "../HallTicketDocument";

/**
 * Printable hall tickets — one A4 sheet per student for the chosen grade /
 * division (or every grade of the examination), with or without the seat.
 * "Print all" → the browser's Save as PDF gives a PDF of every ticket.
 */
export default async function HallTicketsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ examinationId?: string; classId?: string; sectionId?: string; seating?: string }>;
}) {
  const { examinationId = "", classId = "", sectionId = "", seating } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");
  if (!can(ctx.permissions, "examinations.halltickets.manage")) redirect("/examinations");
  if (!examinationId) redirect("/examinations/hall-tickets");

  const [bundle, institution] = await Promise.all([
    buildHallTickets(institutionId, authUserId, {
      examinationId, classId: classId || undefined, sectionId: sectionId || undefined,
      includeSeating: seating === "1" ? true : seating === "0" ? false : undefined,
    }),
    getInstitution(institutionId, authUserId),
  ]);
  if (!bundle) notFound();

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/examinations/hall-tickets?examinationId=${examinationId}`} className="text-sm text-zinc-500 underline">← Back to Hall tickets</Link>
          <p className="mt-1 text-sm text-zinc-600">
            {bundle.tickets.length} hall ticket{bundle.tickets.length === 1 ? "" : "s"} — {bundle.examinationName}
            {bundle.includeSeating ? ", with seats" : ", without seats"}. Each prints on its own sheet; choose “Save as PDF” in the print window for a PDF.
          </p>
          {bundle.classesWithoutTimetable.length > 0 ? (
            <p className="mt-1 text-sm text-amber-700">No ticket was made for {bundle.classesWithoutTimetable.join(", ")} — their timetable has not been fed yet.</p>
          ) : null}
          {bundle.seatingMissing === "no_plan" ? (
            <p className="mt-1 text-sm text-amber-700">Seats are switched on but no seating plan exists for this examination — generate one in Seating Arrangement first. Tickets show “To be announced”.</p>
          ) : null}
          {bundle.seatingMissing === "some_students" ? (
            <p className="mt-1 text-sm text-amber-700">Some students have no seat in the seating plan (marked “To be announced”). Regenerate the plan if students were added after it was made.</p>
          ) : null}
        </div>
        {bundle.tickets.length > 0 ? <PrintButton label="Print all" /> : null}
      </div>

      {bundle.tickets.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing to print. Feed each grade&apos;s timetable and make sure the examination covers the grade and has enrolled students.</p>
      ) : (
        <div className="space-y-6 print:space-y-0">
          {bundle.tickets.map((ticket) => (
            <HallTicketDocument
              key={ticket.studentId}
              ticket={ticket}
              settings={bundle.settings}
              examinationName={bundle.examinationName}
              institutionName={institutionReportName(institution)}
              logoCode={institution?.logoFileId ? institution.code : null}
              showSeat={bundle.includeSeating}
            />
          ))}
        </div>
      )}
    </div>
  );
}
