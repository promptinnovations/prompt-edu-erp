import Link from "next/link";

export interface JourneyStep {
  title: string;
  /** One plain line: what is done / what is left. */
  detail: string;
  done: boolean;
  /** Optional steps never block "next step". */
  optional?: boolean;
  href: string;
  action: string;
}

/**
 * "What to do next" for an examination — the work in the order it is done,
 * with the first unfinished step highlighted and one button to go to it.
 * It only reads existing data and links to the screens that already exist.
 */
export default function ExamJourney({ steps }: { steps: JourneyStep[] }) {
  const nextIdx = steps.findIndex((s) => !s.done && !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section className="no-print rounded-card border border-[var(--border-subtle)] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--heading)]">What to do next</h2>
        <p className="text-xs text-zinc-500">{doneCount} of {steps.length} steps done</p>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <li
              key={s.title}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${isNext ? "border-[var(--brand)] bg-primary-50" : "border-[var(--border-subtle)]"}`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-[var(--brand)] text-white" : isNext ? "border-2 border-[var(--brand)] text-[var(--brand)]" : "border border-zinc-300 text-zinc-400"}`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {s.title}{s.optional ? <span className="ml-1.5 text-xs font-normal text-zinc-500">optional</span> : null}
                </p>
                <p className="text-xs text-zinc-500">{s.detail}</p>
              </div>
              <Link
                href={s.href}
                className={isNext
                  ? "rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
                  : "rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs hover:bg-primary-50"}
              >
                {isNext ? `Next: ${s.action}` : s.action}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
