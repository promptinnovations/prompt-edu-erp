import Link from "next/link";
import type { ChecklistItem } from "../../../services/onboarding/onboarding-service";
import { skipOnboardingItemAction, unskipOnboardingItemAction } from "./actions";

/**
 * Setup checklist, shown only while there's still something left to do.
 * "done" is derived live (see onboarding-service.ts) so an item vanishes
 * the moment the real data behind it exists — nothing to mark complete by
 * hand. "Skip for now" moves an item to a smaller "not right now" list
 * instead of hiding it outright, since the request was specifically for a
 * skip that can still be revisited later, not a dismissal.
 */
export default function OnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  const pending = items.filter((i) => !i.done && !i.skipped);
  const skipped = items.filter((i) => !i.done && i.skipped);

  if (pending.length === 0 && skipped.length === 0) return null;

  const totalDone = items.length - pending.length - skipped.length;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Finish setting up</h2>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{totalDone}/{items.length} done</span>
      </div>

      {pending.length > 0 ? (
        <ul className="space-y-2">
          {pending.map((item) => (
            <li
              key={item.code}
              className="flex flex-col gap-2 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <Link href={item.href} className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                  {item.label}
                </Link>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={item.href}
                  className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  Do it now
                </Link>
                <form action={skipOnboardingItemAction}>
                  <input type="hidden" name="itemCode" value={item.code} />
                  <button type="submit" className="rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    Not applicable / later
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {skipped.length > 0 ? (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="mb-1.5 text-xs font-medium text-zinc-400 dark:text-zinc-500">Set aside for later</div>
          <ul className="space-y-1.5">
            {skipped.map((item) => (
              <li key={item.code} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-zinc-500 dark:text-zinc-400">{item.label}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Link href={item.href} className="text-indigo-500 hover:underline dark:text-indigo-400">
                    Do it now
                  </Link>
                  <form action={unskipOnboardingItemAction}>
                    <input type="hidden" name="itemCode" value={item.code} />
                    <button type="submit" className="text-zinc-400 underline hover:text-zinc-700 dark:hover:text-zinc-200">
                      Move back to checklist
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
