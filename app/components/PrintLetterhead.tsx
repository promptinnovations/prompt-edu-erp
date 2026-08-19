/**
 * PROMPT EDU ERP — "Can I add institution logo?" follow-up: shared
 * logo + institution-name header for every printable document (Report
 * Cards, Consolidated Marks, Monthly Registers, ...) — one component
 * instead of re-pasting the same <img>/fallback markup into each print
 * page. Server Component (no interactivity needed) — renders nothing extra
 * when the institution hasn't uploaded a logo, so pages that already show
 * their own title/heading right below this aren't left with a gap.
 */
export default function PrintLetterhead({
  institutionName,
  logoCode,
  className = "",
}: {
  institutionName: string;
  /** Institution `code`, only when a logo has actually been uploaded — pass
   *  null/undefined to render the name alone with no image. */
  logoCode?: string | null;
  className?: string;
}) {
  return (
    <div className={`mb-4 flex items-center justify-center gap-3 text-center ${className}`}>
      {logoCode ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic per-institution URL, printed letterhead
        <img src={`/api/institution-logo/${logoCode}`} alt="" className="h-10 w-10 shrink-0 object-contain" />
      ) : null}
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{institutionName}</h2>
    </div>
  );
}
