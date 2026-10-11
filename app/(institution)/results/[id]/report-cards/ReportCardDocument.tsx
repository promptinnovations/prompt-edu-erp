import { formatDateIST, todayIST } from "../../../../../services/datetime/ist";
import { formatMarks } from "../../../../../services/format/marks";
import type { ReportCardData, ReportCardContext } from "./report-card-data";

/** §Report-card-print-all — the printable card itself, shared by the
 *  single-student route and the whole-class print route so they render
 *  identical documents. Presentational only: every value is resolved by
 *  loadReportCards() before it gets here.
 *
 *  §Report-card-A4 redesign ("it should fill an a4 page completely —
 *  improve font sizes, spacing and all, it should look professional";
 *  "use same spacing between Total TE and CE"; "descriptor can move
 *  rightwards"):
 *
 *  - The card is a true A4 sheet (`.report-sheet`, see globals.css): 210mm
 *    wide, a framed body that fills the full 297mm height, printed on a
 *    named `report-card` page with zero browser margin. The on-screen
 *    preview uses the same millimetre/point dimensions, so what you see is
 *    what prints.
 *  - Type is set in points for print: institution name 17pt, body 10.5pt,
 *    labels 8–8.5pt. Previously everything was Tailwind's screen sizes
 *    squeezed by `print:` overrides, which left the card in the top half
 *    of the page.
 *  - The marks table is `table-fixed` with a <colgroup>: every numeric
 *    column (TE, Total TE, CE, Total CE, Grade) has the same width and is
 *    centred, so the gap between any two of them is identical — the old
 *    right-aligned, padding-less cells put Total TE and CE almost on top
 *    of each other. Descriptor gets its own wide column at the right edge
 *    with extra left padding.
 *  - Leftover height goes to a ruled Class Teacher's Remarks box
 *    (flex-1), so the signatures always sit at the foot of the page
 *    instead of the card ending mid-sheet. Signatures are Class Teacher,
 *    Parent/Guardian and Principal.
 *  - Row density steps down for long subject lists (11+ and 15+ subjects)
 *    so a full card still fits one sheet; a genuinely oversized card
 *    flows onto a second sheet rather than clipping its signatures. */
type Density = "normal" | "compact" | "tight";

function densityFor(rows: number): Density {
  if (rows >= 15) return "tight";
  if (rows >= 11) return "compact";
  return "normal";
}

const CELL_Y: Record<Density, string> = {
  normal: "py-[2.4mm]",
  compact: "py-[1.4mm]",
  tight: "py-[0.9mm]",
};
const BODY_TEXT: Record<Density, string> = {
  normal: "text-[10.5pt]",
  compact: "text-[9.5pt]",
  tight: "text-[9pt]",
};
const REMARKS_MIN: Record<Density, string> = {
  normal: "min-h-[24mm]",
  compact: "min-h-[16mm]",
  tight: "min-h-[10mm]",
};

/** Ruled lines for the remarks box — an inline style rather than a Tailwind
 *  arbitrary value, since a gradient's commas and theme colours don't
 *  survive arbitrary-value parsing cleanly. */
const RULED_LINES: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, transparent 0, transparent 7.2mm, #d4d4d8 7.2mm, #d4d4d8 calc(7.2mm + 0.6pt))",
  backgroundPositionY: "9mm",
};

function InfoField({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[7.5pt] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</dt>
      <dd className="mt-[0.6mm] text-[11pt] font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

function SummaryTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[1.5mm] border border-zinc-300 px-[2mm] py-[3mm] text-center">
      <p className="text-[7.5pt] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p
        className={`mt-[1mm] text-[15pt] font-bold tabular-nums ${accent ? "text-[var(--brand)]" : "text-zinc-900"}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function ReportCardDocument({
  card,
  context,
  institutionName,
  logoCode,
}: {
  card: ReportCardData;
  context: ReportCardContext;
  institutionName: string;
  logoCode: string | null;
  /** Kept for call-site compatibility; page breaks are now handled by the
   *  `.report-sheet` print rules (break after every sheet but the last). */
  breakAfter?: boolean;
}) {
  const density = densityFor(card.rows.length);
  const cellY = CELL_Y[density];
  const numCell = `border border-zinc-300 px-[2mm] ${cellY} text-center tabular-nums`;
  const headCell =
    "border border-zinc-400 bg-zinc-100 px-[2mm] py-[2.2mm] text-center text-[8pt] font-bold uppercase tracking-[0.08em] text-zinc-700";
  const title = context.isDailyAssessment ? "Daily Assessment Report Card" : "Report Card";
  const classLine = `${card.class_name ?? "—"}${card.section_name ? ` - ${card.section_name}` : ""}`;

  return (
    <article className="report-sheet mx-auto w-full max-w-[210mm] bg-white p-[4mm] shadow-raised sm:min-h-[297mm] sm:p-[10mm] print:p-[10mm]">
      <div className="flex flex-col border-[1.2pt] border-zinc-800 p-[4mm] sm:min-h-[276mm] sm:p-[8mm] print:min-h-[276mm] print:p-[8mm]">
        {/* ── Letterhead ─────────────────────────────────────────────── */}
        <header className="flex items-center gap-[5mm] border-b-[3pt] border-double border-zinc-800 pb-[4mm]">
          {logoCode ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic per-institution URL, printed letterhead
            <img
              src={`/api/institution-logo/${logoCode}`}
              alt=""
              className="h-[22mm] w-[22mm] shrink-0 object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[17pt] font-bold uppercase leading-tight tracking-[0.02em] text-zinc-900">
              {institutionName}
            </p>
            <p className="mt-[1.5mm] text-[12pt] font-bold uppercase tracking-[0.28em] text-[var(--brand)]">{title}</p>
            <p className="mt-[1mm] text-[10pt] text-zinc-600">{context.examHeaderLine}</p>
          </div>
          {/* Mirror of the logo's width so the title block stays optically
              centred on the sheet, not centred in the leftover space. */}
          {logoCode ? <span className="h-[22mm] w-[22mm] shrink-0" aria-hidden="true" /> : null}
        </header>

        {/* ── Student details ───────────────────────────────────────── */}
        <section className="mt-[6mm] flex items-start gap-[6mm]">
          <dl className="grid flex-1 grid-cols-2 gap-x-[8mm] gap-y-[3.5mm]">
            <InfoField
              label="Student name"
              value={<span className="text-[13pt] font-bold">{card.student_name}</span>}
              className="col-span-2"
            />
            <InfoField label="Admission no." value={card.admission_number} />
            <InfoField label="Class & division" value={classLine} />
            <InfoField label="Roll no." value={card.roll_number != null ? String(card.roll_number) : "—"} />
            <InfoField label="Date of birth" value={card.date_of_birth ? formatDateIST(card.date_of_birth) : "—"} />
            {card.gender ? <InfoField label="Gender" value={card.gender} /> : null}
          </dl>
          {card.photo_file_id ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route
            <img
              src={`/api/files/${card.photo_file_id}`}
              alt=""
              className="h-[32mm] w-[26mm] shrink-0 border border-zinc-400 object-cover"
            />
          ) : (
            <span className="flex h-[32mm] w-[26mm] shrink-0 items-center justify-center border border-zinc-400 bg-zinc-50 text-[22pt] font-semibold text-zinc-400">
              {card.student_name.charAt(0).toUpperCase()}
            </span>
          )}
        </section>

        {/* ── Marks ─────────────────────────────────────────────────── */}
        <section className="mt-[6mm]">
          <table className={`w-full table-fixed border-collapse ${BODY_TEXT[density]} text-zinc-900`}>
            <colgroup>
              <col />
              <col className="w-[18mm]" />
              <col className="w-[18mm]" />
              {card.hasCe ? <col className="w-[18mm]" /> : null}
              {card.hasCe ? <col className="w-[18mm]" /> : null}
              <col className="w-[18mm]" />
              <col className={card.hasCe ? "w-[40mm]" : "w-[52mm]"} />
            </colgroup>
            <thead>
              <tr>
                <th className={`${headCell} text-left`}>Subject</th>
                <th className={headCell}>TE</th>
                <th className={headCell}>Total TE</th>
                {card.hasCe ? <th className={headCell}>CE</th> : null}
                {card.hasCe ? <th className={headCell}>Total CE</th> : null}
                <th className={headCell}>Grade</th>
                <th className={`${headCell} pl-[4mm] text-left`}>Descriptor</th>
              </tr>
            </thead>
            <tbody>
              {card.rows.map((r, i) => (
                <tr key={r.key} className={i % 2 === 1 ? "bg-zinc-50" : ""}>
                  <td className={`border border-zinc-300 px-[3mm] ${cellY} font-medium`}>
                    {r.subject_name}
                    {r.subject_note ? (
                      <span className="block text-[7.5pt] font-normal text-zinc-500">{r.subject_note}</span>
                    ) : null}
                  </td>
                  <td className={numCell}>{r.te}</td>
                  <td className={`${numCell} text-zinc-600`}>{r.total_te}</td>
                  {card.hasCe ? <td className={numCell}>{r.ce}</td> : null}
                  {card.hasCe ? <td className={`${numCell} text-zinc-600`}>{r.total_ce}</td> : null}
                  <td className={`${numCell} font-bold`}>{r.grade_label ?? "—"}</td>
                  <td className={`border border-zinc-300 pl-[4mm] pr-[2mm] ${cellY} text-zinc-700`}>
                    {r.descriptor || "—"}
                  </td>
                </tr>
              ))}
              {card.rows.length === 0 ? (
                <tr>
                  <td colSpan={card.hasCe ? 7 : 5} className="border border-zinc-300 py-[6mm] text-center text-zinc-500">
                    No marks recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {/* ── Overall summary ───────────────────────────────────────── */}
        <section className="mt-[6mm]">
          {card.summary ? (
            <div className={`grid gap-[3mm] ${card.attendance ? "grid-cols-4" : "grid-cols-3"}`}>
              <SummaryTile
                label="Total marks"
                value={`${formatMarks(card.summary.total_marks)} / ${formatMarks(card.summary.max_total_marks)}`}
              />
              <SummaryTile label="Percentage" value={`${card.summary.percentage.toFixed(1)}%`} />
              <SummaryTile label="Overall grade" value={card.summary.grade_label ?? "—"} accent />
              {card.attendance ? (
                <SummaryTile
                  label="Attendance"
                  value={`${card.attendance.present_days} / ${card.attendance.total_days}`}
                />
              ) : null}
            </div>
          ) : (
            <p className="rounded-[1.5mm] border border-zinc-300 px-[4mm] py-[4mm] text-[10pt] text-zinc-500">
              {context.isDailyAssessment
                ? "No marks entered for this student in this month’s register yet."
                : "Overall total/grade not computed yet — compute results from the examination’s detail page first."}
            </p>
          )}
          {card.summary && card.attendance ? (
            <p className="mt-[1.5mm] text-right text-[8pt] text-zinc-500">
              Attendance {card.attendance.present_percent}% of working days this academic year
            </p>
          ) : null}
        </section>

        {/* ── Remarks (absorbs the remaining height) ────────────────── */}
        <section className={`mt-[6mm] flex flex-1 flex-col rounded-[1.5mm] border border-zinc-300 ${REMARKS_MIN[density]}`}>
          <p className="px-[4mm] pt-[2.5mm] text-[8pt] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Class teacher&rsquo;s remarks
          </p>
          <div className="mx-[4mm] mb-[3mm] flex-1" style={RULED_LINES} />
        </section>

        {/* ── Signatures ────────────────────────────────────────────── */}
        <section className="mt-[12mm] grid grid-cols-3 gap-[10mm] text-center text-[9pt] text-zinc-700">
          <div className="border-t border-zinc-700 pt-[1.5mm]">Class Teacher</div>
          <div className="border-t border-zinc-700 pt-[1.5mm]">Parent / Guardian</div>
          <div className="border-t border-zinc-700 pt-[1.5mm]">Principal</div>
        </section>

        <footer className="mt-[5mm] flex items-center justify-between text-[7pt] uppercase tracking-[0.1em] text-zinc-400">
          <span>Printed on {formatDateIST(todayIST())}</span>
          <span>Powered by PROMPT EDU ERP &middot; &copy; Prompt Innovations</span>
        </footer>
      </div>
    </article>
  );
}
