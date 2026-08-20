"use client";

import { useActionState } from "react";
import { submitOwnReadingReviewAction } from "./actions";

export interface PendingReviewRow { id: string; book_title: string }

function ReviewForm({ readingRecordId }: { readingRecordId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(submitOwnReadingReviewAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="readingRecordId" value={readingRecordId} />
      <div className="flex-1">
        <textarea
          name="reviewText"
          required
          rows={2}
          placeholder="What did you think of this book?"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Post review
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

/** §Page-8 follow-up "Children can post review of a book they read" —
 *  books this student has already returned that are still waiting for a
 *  review; only appears once returnBook() has created the pending
 *  reading_records row, and only reviewable ONCE — the form for a row
 *  disappears the moment it's submitted (review_status leaves 'pending'
 *  from the reviewer's perspective isn't tracked here, but the row simply
 *  won't be in this list again once approved/rejected). */
export default function MyPendingReviews({ reviews }: { reviews: PendingReviewRow[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No books waiting for a review right now.</p>;
  }
  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <div key={r.id} className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-3">
          <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">{r.book_title}</p>
          <ReviewForm readingRecordId={r.id} />
        </div>
      ))}
    </div>
  );
}
