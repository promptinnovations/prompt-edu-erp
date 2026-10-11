"use client";

import { useActionState } from "react";
import { placeHoldAction, cancelOwnHoldAction } from "../actions";

/** §Library-workflow — the one action block on a book's page, driven
 *  entirely by the student's current relationship to the book (computed
 *  server-side by getBookDetail()):
 *    - issued to me          → "You have this book" + due date (no action)
 *    - active hold, notified → "Ready — collect it at the library" + cancel
 *    - active hold, pending  → "Waiting — you'll be notified" + cancel
 *    - available             → "Take this book" (creates a ready-to-collect
 *                               booking the librarian sees, then tells the
 *                               student to go and collect it)
 *    - all copies out        → "Pre-book" (notified on return)
 *  Both buttons post to the same placeHoldAction — placeHold() decides
 *  pending vs notified from live availability, so the UI never has to. */
export default function BookActions({
  bookId, available, myHold, myIssue,
}: {
  bookId: string;
  available: boolean;
  myHold: { id: string; status: string } | null;
  myIssue: { due_date: string; is_overdue: boolean } | null;
}) {
  const [holdState, holdAction, holdPending] = useActionState<{ error: string | null }, FormData>(placeHoldAction, { error: null });
  const [cancelState, cancelAction, cancelPending] = useActionState<{ error: string | null }, FormData>(cancelOwnHoldAction, { error: null });

  if (myIssue) {
    return (
      <div className={`rounded-xl border p-4 ${myIssue.is_overdue ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
        <p className={`text-sm font-semibold ${myIssue.is_overdue ? "text-red-700" : "text-emerald-700"}`}>
          {myIssue.is_overdue ? "You have this book — it's overdue" : "You have this book"}
        </p>
        <p className="mt-0.5 text-xs text-zinc-600">
          Due {myIssue.due_date}. Return it at the library when you&apos;re done — you&apos;ll be able to write your review right here afterwards.
        </p>
      </div>
    );
  }

  if (myHold) {
    const ready = myHold.status === "notified";
    return (
      <div className={`rounded-xl border p-4 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p className={`text-sm font-semibold ${ready ? "text-emerald-700" : "text-amber-700"}`}>
          {ready ? "Ready for you — go to the library and collect it" : "Booked — you'll be notified when it's returned"}
        </p>
        <p className="mt-0.5 text-xs text-zinc-600">
          {ready
            ? "Tell the librarian your name; the book is reserved under it."
            : "Every copy is out right now. The moment one comes back, you'll get a notification and it will be held for you."}
        </p>
        <form action={cancelAction} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="holdId" value={myHold.id} />
          <button type="submit" disabled={cancelPending} className="text-xs text-red-600 underline disabled:opacity-50">
            Cancel booking
          </button>
          {cancelState.error ? <span className="text-xs text-red-600">{cancelState.error}</span> : null}
        </form>
      </div>
    );
  }

  return (
    <form action={holdAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="bookId" value={bookId} />
      <button
        type="submit"
        disabled={holdPending}
        className={`rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
          available ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[var(--brand)] hover:bg-[var(--brand-hover)]"
        }`}
      >
        {holdPending ? "Please wait…" : available ? "Take this book" : "Pre-book — notify me when it's back"}
      </button>
      <span className="text-xs text-zinc-500">
        {available ? "Reserves it under your name — then collect it at the library." : "You'll be first in line when a copy is returned."}
      </span>
      {holdState.error ? <span className="basis-full text-sm text-red-600">{holdState.error}</span> : null}
    </form>
  );
}
