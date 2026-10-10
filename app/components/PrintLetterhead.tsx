/**
 * PROMPT EDU ERP — "Can I add institution logo?" follow-up: shared
 * logo + institution-name header for every printable document (Report
 * Cards, Consolidated Marks, Monthly Registers, ...) — one component
 * instead of re-pasting the same <img>/fallback markup into each print
 * page. Server Component (no interactivity needed) — renders nothing extra
 * when the institution hasn't uploaded a logo, so pages that already show
 * their own title/heading right below this aren't left with a gap.
 *
 * §Report-card-layout follow-up (reference image: logo on the left beside
 * a left-aligned text stack — institution name, document title, exam/year
 * — rather than logo-above-centered-name): `titleLines` is an additive,
 * optional prop that switches to that left-logo/stacked-text arrangement.
 * Every other caller (Consolidated Marks, registers, stickers, invoices,
 * ...) omits it and keeps today's centered single-row layout unchanged.
 */
export default function PrintLetterhead({
  institutionName,
  logoCode,
  className = "",
  titleLines,
}: {
  institutionName: string;
  /** Institution `code`, only when a logo has actually been uploaded — pass
   *  null/undefined to render the name alone with no image. */
  logoCode?: string | null;
  className?: string;
  /** Extra lines stacked under the institution name, to the right of the
   *  logo — e.g. ["Report Card", "Annual Exam · 2026-27"]. The first line
   *  renders as a bold uppercase document title, the rest as smaller muted
   *  detail lines. Omit to keep the default centered logo+name row. */
  titleLines?: string[];
}) {
  if (titleLines && titleLines.length > 0) {
    return (
      <div className={`flex items-center justify-center gap-3 ${className}`}>
        {logoCode ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic per-institution URL, printed letterhead
          <img src={`/api/institution-logo/${logoCode}`} alt="" className="h-14 w-14 shrink-0 object-contain print:h-12 print:w-12" />
        ) : null}
        <div className="text-left">
          <p className="text-base font-semibold text-[var(--heading)]">{institutionName}</p>
          <p className="text-sm font-bold uppercase tracking-[0.06em] text-[var(--heading)]">{titleLines[0]}</p>
          {titleLines.slice(1).map((line, i) => (
            <p key={i} className="text-xs text-zinc-500">{line}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-4 flex items-center justify-center gap-3 text-center ${className}`}>
      {logoCode ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic per-institution URL, printed letterhead
        <img src={`/api/institution-logo/${logoCode}`} alt="" className="h-10 w-10 shrink-0 object-contain" />
      ) : null}
      <h2 className="text-lg font-semibold text-[var(--heading)]">{institutionName}</h2>
    </div>
  );
}
