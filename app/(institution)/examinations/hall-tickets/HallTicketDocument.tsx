import type { HallTicket, HallTicketSettings } from "../../../../modules/examination/hall-ticket-service";
import { formatClock } from "../../../../modules/examination/hall-ticket-service";
import { formatDateIST } from "../../../../services/datetime/ist";
import { decorColor, tint } from "../../../components/portal/viz/palette";
import FitToPage from "../../results/[id]/report-cards/FitToPage";

/**
 * Space is used according to how many papers the grade has: a lower class with
 * 3 papers gets tall rows, large type and generous gaps so the page is filled
 * well; a higher class with 14+ papers gets tight rows. FitToPage is the final
 * guarantee — whatever the tier, nothing ever spills onto a second page.
 */
function density(papers: number) {
  if (papers <= 3) return { row: 17, table: 13.5, base: 14, gap: 11, head: 22, title: 19, gapSm: 4 };
  if (papers <= 6) return { row: 12.5, table: 12.5, base: 13, gap: 8.5, head: 20, title: 17, gapSm: 3.2 };
  if (papers <= 10) return { row: 9, table: 11, base: 12, gap: 6, head: 18, title: 15, gapSm: 2.4 };
  if (papers <= 16) return { row: 7, table: 10, base: 11, gap: 4.5, head: 17, title: 14, gapSm: 1.8 };
  return { row: 5.6, table: 9, base: 10, gap: 3, head: 16, title: 13, gapSm: 1.2 };
}

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
  const n = ticket.days.reduce((a, d) => a + d.papers.length, 0);
  const k = density(n);
  const cell = "border border-zinc-500 px-[2mm]";
  const cellStyle = { height: `${k.row}mm`, fontSize: `${k.table}pt` } as const;
  const classLine = `${ticket.className}${ticket.sectionName ? ` ${ticket.sectionName}` : ""}`;
  const contact = [settings.address, settings.email, settings.phones].filter(Boolean);

  return (
    <article data-hall-ticket={`${ticket.className}_${ticket.admissionNumber ?? ""}_${ticket.name}`} className="report-sheet mx-auto w-full max-w-[210mm] bg-white p-[4mm] shadow-raised sm:min-h-[297mm] sm:p-[10mm] print:p-[10mm]">
      <div className="flex flex-col p-[2mm] sm:min-h-[276mm] print:min-h-[276mm]">
        <FitToPage className="flex flex-1 flex-col justify-between">
          <header className="flex items-center gap-[5mm] border-b-[1.5pt] border-[var(--brand)] pb-[3mm]" style={{ fontSize: `${k.base}pt` }}>
            {logoCode ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic per-institution URL, printed letterhead
              <img src={`/api/institution-logo/${logoCode}`} alt="" className="h-[24mm] w-[24mm] shrink-0 object-contain" />
            ) : null}
            <div className="min-w-0 flex-1 text-right">
              <p className="font-bold uppercase leading-tight text-[var(--heading)]" style={{ fontSize: `${k.head}pt` }}>{institutionName}</p>
              {contact.map((line) => <p key={line} className="text-[9.5pt] text-zinc-600">{line}</p>)}
            </div>
          </header>

          <div className="text-center" style={{ marginTop: `${k.gap}mm` }}>
            <p className="font-bold uppercase text-[var(--brand)]" style={{ fontSize: `${k.title}pt` }}>{examinationName}</p>
            <p className="mt-[1mm] text-[11pt] font-bold uppercase tracking-[0.1em]" style={{ color: decorColor(2) }}>{settings.ticketTitle}</p>
          </div>

          <div className="flex items-start justify-between gap-[6mm]" style={{ marginTop: `${k.gap}mm` }}>
          <dl className="grid min-w-0 flex-1 grid-cols-[48mm_6mm_1fr]" style={{ fontSize: `${k.base}pt`, rowGap: `${k.gapSm + 1}mm` }}>
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
          {ticket.photoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route
            <img src={`/api/files/${ticket.photoFileId}`} alt="" className="h-[32mm] w-[26mm] shrink-0 border border-zinc-500 object-cover" />
          ) : null}
          </div>

          <p className="text-center font-bold uppercase text-[var(--brand)]" style={{ marginTop: `${k.gap}mm`, fontSize: `${k.base}pt` }}>Time table for {examinationName}</p>
          <table className="w-full border-collapse text-center" style={{ marginTop: `${k.gapSm}mm` }}>
            <thead>
              <tr>
                <th className={`${cell} font-bold`} style={cellStyle}>DATE</th>
                <th className={`${cell} font-bold`} style={cellStyle}>TIME</th>
                <th className={`${cell} font-bold`} style={cellStyle}>Subject</th>
                {settings.showSignature ? <th className={`${cell} font-bold`} style={cellStyle}>Signature</th> : null}
              </tr>
            </thead>
            <tbody>
              {ticket.days.map((day, di) =>
                day.papers.map((p, pi) => (
                  <tr key={`${day.date}-${p.startTime}`} style={di % 2 === 0 ? shade : undefined}>
                    {pi === 0 ? (
                      <td rowSpan={day.papers.length} className={`${cell} font-semibold`} style={{ ...cellStyle, ...(di % 2 === 0 ? shade : {}) }}>
                        {formatDateIST(day.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </td>
                    ) : null}
                    <td className={cell} style={cellStyle}>{formatClock(p.startTime)}{p.endTime ? ` – ${formatClock(p.endTime)}` : ""}</td>
                    <td className={`${cell} font-medium`} style={cellStyle}>{p.subject}</td>
                    {settings.showSignature ? <td className={cell} style={cellStyle} /> : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <section style={{ marginTop: `${k.gap}mm`, fontSize: `${k.base}pt` }}>
            <h2 className="font-bold uppercase underline">Instructions</h2>
            <ul style={{ marginTop: `${k.gapSm}mm`, display: "grid", rowGap: `${k.gapSm}mm`, fontSize: "0.92em" }}>
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
