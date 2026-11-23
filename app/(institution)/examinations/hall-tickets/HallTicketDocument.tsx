import type { HallTicket, HallTicketSettings } from "../../../../modules/examination/hall-ticket-service";
import { formatClock } from "../../../../modules/examination/hall-ticket-service";
import { formatDateIST } from "../../../../services/datetime/ist";
import { decorColor, tint } from "../../../components/portal/viz/palette";
import FitToPage from "../../results/[id]/report-cards/FitToPage";

/**
 * One hall ticket = one A4 sheet (the same `.report-sheet` + FitToPage
 * machinery as report cards, so a long timetable shrinks to fit and a ticket
 * never spills onto a second page). Layout follows the school's sample:
 * letterhead, exam title, candidate lines, a DATE / TIME / SUBJECT /
 * SIGNATURE table with alternate dates shaded, then the instructions.
 */
export default function HallTicketDocument({ ticket, settings, examinationName, institutionName, logoCode, showSeat }: {
  ticket: HallTicket; settings: HallTicketSettings; examinationName: string;
  institutionName: string; logoCode: string | null; showSeat: boolean;
}) {
  const shade = { backgroundColor: tint(decorColor(0), 0.16), printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;
  const cell = "border border-zinc-500 px-[2mm] py-[1.6mm] text-[10pt]";
  const classLine = `${ticket.className}${ticket.sectionName ? ` ${ticket.sectionName}` : ""}`;
  const contact = [settings.address, settings.email, settings.phones].filter(Boolean);

  return (
    <article className="report-sheet mx-auto w-full max-w-[210mm] bg-white p-[4mm] shadow-raised sm:min-h-[297mm] sm:p-[10mm] print:p-[10mm]">
      <div className="flex flex-col p-[2mm] sm:min-h-[276mm] print:min-h-[276mm]">
        <FitToPage className="flex flex-1 flex-col">
          <header className="flex items-center gap-[5mm] border-b-[1.5pt] border-[var(--brand)] pb-[3mm]">
            {logoCode ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic per-institution URL, printed letterhead
              <img src={`/api/institution-logo/${logoCode}`} alt="" className="h-[22mm] w-[22mm] shrink-0 object-contain" />
            ) : null}
            <div className="min-w-0 flex-1 text-right">
              <p className="text-[18pt] font-bold uppercase leading-tight text-[var(--heading)]">{institutionName}</p>
              {contact.map((line) => <p key={line} className="text-[9.5pt] text-zinc-600">{line}</p>)}
            </div>
          </header>

          <div className="mt-[6mm] text-center">
            <p className="text-[15pt] font-bold uppercase text-[var(--brand)]">{examinationName}</p>
            <p className="mt-[1mm] text-[11pt] font-bold uppercase tracking-[0.1em]" style={{ color: decorColor(2) }}>{settings.ticketTitle}</p>
          </div>

          <dl className="mt-[6mm] grid grid-cols-[48mm_6mm_1fr] gap-y-[2mm] text-[12pt]">
            <dt className="font-bold">Name of Candidate</dt><dd className="font-bold">:</dd><dd>{ticket.name}</dd>
            <dt className="font-bold">Admission no</dt><dd className="font-bold">:</dd><dd>{ticket.admissionNumber ?? "—"}</dd>
            <dt className="font-bold">Class &amp; Division</dt><dd className="font-bold">:</dd><dd>{classLine}</dd>
            {showSeat ? (
              <>
                <dt className="font-bold">Seat</dt><dd className="font-bold">:</dd>
                <dd>{ticket.seat ? `${ticket.seat.room} · Bench ${ticket.seat.bench} · Seat ${ticket.seat.seat}` : "To be announced"}</dd>
              </>
            ) : null}
          </dl>

          <p className="mt-[6mm] text-center text-[11pt] font-bold uppercase text-[var(--brand)]">Time table for {examinationName}</p>
          <table className="mt-[2mm] w-full border-collapse text-center">
            <thead>
              <tr>
                <th className={`${cell} font-bold`}>DATE</th>
                <th className={`${cell} font-bold`}>TIME</th>
                <th className={`${cell} font-bold`}>Subject</th>
                {settings.showSignature ? <th className={`${cell} font-bold`}>Signature</th> : null}
              </tr>
            </thead>
            <tbody>
              {ticket.days.map((day, di) =>
                day.papers.map((p, pi) => (
                  <tr key={`${day.date}-${p.startTime}`} style={di % 2 === 0 ? shade : undefined}>
                    {pi === 0 ? (
                      <td rowSpan={day.papers.length} className={`${cell} font-semibold`} style={di % 2 === 0 ? shade : undefined}>
                        {formatDateIST(day.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </td>
                    ) : null}
                    <td className={cell}>{formatClock(p.startTime)}{p.endTime ? ` – ${formatClock(p.endTime)}` : ""}</td>
                    <td className={`${cell} font-medium`}>{p.subject}</td>
                    {settings.showSignature ? <td className={`${cell} h-[8mm]`} /> : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <section className="mt-[6mm]">
            <h2 className="text-[11pt] font-bold uppercase underline">Instructions</h2>
            <ul className="mt-[2mm] space-y-[1.5mm] text-[10.5pt]">
              {settings.instructions.map((line, i) => (
                <li key={i} className="flex gap-[2.5mm]"><span aria-hidden>➢</span><span>{line}</span></li>
              ))}
            </ul>
          </section>
        </FitToPage>
      </div>
    </article>
  );
}
