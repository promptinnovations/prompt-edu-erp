"use client";

import { useActionState } from "react";
import { reactToReviewAction } from "./actions";

export interface ApprovedReviewProps {
  id: string; book_title: string; student_name: string; review_text: string;
  like_count: number; dislike_count: number; my_reaction: "like" | "dislike" | null;
}

function ReactButton({ readingRecordId, reaction, label, active }: { readingRecordId: string; reaction: "like" | "dislike"; label: string; active: boolean }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(reactToReviewAction, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="readingRecordId" value={readingRecordId} />
      <input type="hidden" name="reaction" value={reaction} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg border px-2 py-1 text-xs disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 ${
          active
            ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
            : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
      >
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

/** §Page-8 follow-up "Review Corner" — every approved review, browsable by
 *  any student (per the user's own clarification: "children can read
 *  others' reviews before reading to check interest") with like/dislike
 *  reaction buttons. `canReact` is false when the viewer has no linked
 *  student record (e.g. this component were ever reused outside the
 *  student portal) — buttons still render but are visually disabled-ish
 *  via the action's own "No student record linked" error surfaced inline. */
export default function ReviewCorner({ reviews }: { reviews: ApprovedReviewProps[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No reviews yet — be the first to post one after finishing a book!</p>;
  }
  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <div key={r.id} className="rounded-xl border border-zinc-100 dark:border-zinc-800 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{r.book_title}</p>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">by {r.student_name}</span>
          </div>
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">{r.review_text}</p>
          <div className="flex items-center gap-2">
            <ReactButton readingRecordId={r.id} reaction="like" label={`👍 ${r.like_count}`} active={r.my_reaction === "like"} />
            <ReactButton readingRecordId={r.id} reaction="dislike" label={`👎 ${r.dislike_count}`} active={r.my_reaction === "dislike"} />
          </div>
        </div>
      ))}
    </div>
  );
}
