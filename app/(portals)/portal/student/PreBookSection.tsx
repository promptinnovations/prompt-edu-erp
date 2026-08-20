"use client";

import { useActionState } from "react";
import { placeHoldAction, cancelOwnHoldAction } from "./actions";

export interface HoldableBook { id: string; title: string; available_copies: number }
export interface MyHoldRow { id: string; book_title: string; status: string }

function PlaceHoldButton({ bookId }: { bookId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(placeHoldAction, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="bookId" value={bookId} />
      <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
        Pre-book
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

function CancelHoldButton({ holdId }: { holdId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(cancelOwnHoldAction, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="holdId" value={holdId} />
      <button type="submit" disabled={pending} className="text-xs text-red-600 dark:text-red-400 underline disabled:opacity-50">
        Cancel
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

/** §Page-8 follow-up "Pre book — a book which has already been issued,
 *  another child can pre book it. Once it is returned, notification for
 *  the one booked will be delivered." `holdableBooks` is pre-filtered by
 *  the caller to available_copies === 0 (placeHold() itself also refuses
 *  the opposite case, so this is a UX convenience, not the only guard). */
export default function PreBookSection({
  holdableBooks, myHolds,
}: {
  holdableBooks: HoldableBook[];
  myHolds: MyHoldRow[];
}) {
  return (
    <div className="space-y-4">
      {myHolds.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">My pre-bookings</p>
          <ul className="space-y-1">
            {myHolds.map((h) => (
              <li key={h.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {h.book_title} <span className="text-xs text-zinc-400 dark:text-zinc-500">({h.status === "notified" ? "ready to collect!" : "waiting"})</span>
                </span>
                <CancelHoldButton holdId={h.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Fully issued — pre-book one</p>
        {holdableBooks.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Every book currently has a copy available — nothing to pre-book.</p>
        ) : (
          <ul className="space-y-1">
            {holdableBooks.map((b) => (
              <li key={b.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{b.title}</span>
                <PlaceHoldButton bookId={b.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
