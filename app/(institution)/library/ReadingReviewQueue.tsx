"use client";

import { useActionState } from "react";
import { submitReadingReviewAction, approveReadingRecordAction, rejectReadingRecordAction } from "./actions";

export interface ReadingRecordRow {
  id: string; student_name: string; book_title: string; review_text: string | null; review_status: string;
}

function SubmitReviewForm({ readingRecordId }: { readingRecordId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(submitReadingReviewAction, { error: null });
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="readingRecordId" value={readingRecordId} />
      <input name="reviewText" placeholder="Review text…" className="rounded-md border border-zinc-300 px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        Save
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

function ReviewDecisionButton({ action, label, readingRecordId }: { action: typeof approveReadingRecordAction; label: string; readingRecordId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="readingRecordId" value={readingRecordId} />
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
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
      <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
        <tr>
          <th className="py-1.5">Student</th>
          <th className="py-1.5">Book</th>
          <th className="py-1.5">Review</th>
          <th className="py-1.5" />
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {records.map((r) => (
          <tr key={r.id}>
            <td className="py-1.5">{r.student_name}</td>
            <td className="py-1.5">{r.book_title}</td>
            <td className="py-1.5">
              {r.review_text ?? <SubmitReviewForm readingRecordId={r.id} />}
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
          <tr><td colSpan={4} className="py-4 text-center text-zinc-400">No pending reading reviews.</td></tr>
        ) : null}
      </tbody>
    </table>
    </div>
  );
}
