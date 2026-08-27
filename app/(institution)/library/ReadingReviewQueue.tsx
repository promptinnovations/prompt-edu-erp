"use client";

import { useActionState } from "react";
import { submitReadingReviewAction, approveReadingRecordAction, rejectReadingRecordAction } from "./actions";
import RichTextContent from "../../components/RichTextContent";

export interface ReadingRecordRow {
  id: string; student_name: string; book_title: string; review_text: string | null; review_status: string;
}

function SubmitReviewForm({ readingRecordId }: { readingRecordId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(submitReadingReviewAction, { error: null });
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="readingRecordId" value={readingRecordId} />
      <input name="reviewText" placeholder="Review text…" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
        Save
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

function ReviewDecisionButton({ action, label, readingRecordId }: { action: typeof approveReadingRecordAction; label: string; readingRecordId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="readingRecordId" value={readingRecordId} />
      <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

export default function ReadingReviewQueue({
  records,
  canReview,
}: {
  records: ReadingRecordRow[];
  canReview: boolean;
}) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <tr>
          <th className="py-1.5">Student</th>
          <th className="py-1.5">Book</th>
          <th className="py-1.5">Review</th>
          <th className="py-1.5" />
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {records.map((r) => (
          <tr key={r.id}>
            <td className="py-1.5">{r.student_name}</td>
            <td className="py-1.5">{r.book_title}</td>
            <td className="py-1.5 max-w-xs">
              {r.review_text ? <RichTextContent html={r.review_text} className="text-sm" /> : <SubmitReviewForm readingRecordId={r.id} />}
            </td>
            <td className="py-1.5">
              {canReview ? (
                <div className="flex gap-1">
                  <ReviewDecisionButton action={approveReadingRecordAction} label="Approve" readingRecordId={r.id} />
                  <ReviewDecisionButton action={rejectReadingRecordAction} label="Reject" readingRecordId={r.id} />
                </div>
              ) : null}
            </td>
          </tr>
        ))}
        {records.length === 0 ? (
          <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No pending reading reviews.</td></tr>
        ) : null}
      </tbody>
    </table>
    </div>
  );
}
