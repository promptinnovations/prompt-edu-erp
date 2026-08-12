"use client";

import { useActionState } from "react";
import {
  verifySkillSubmissionAction, rejectSkillSubmissionAction, returnSkillSubmissionAction, approveSkillSubmissionAction,
} from "./actions";

export interface SubmissionRow {
  id: string; student_name: string; activity_name: string; status: string; evidence_file_id: string | null;
}

function ActionButton({ action, label, submissionId }: { action: typeof verifySkillSubmissionAction; label: string; submissionId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="submissionId" value={submissionId} />
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export default function SubmissionsTable({
  submissions,
  canReview,
  canApprove,
}: {
  submissions: SubmissionRow[];
  canReview: boolean;
  canApprove: boolean;
}) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
        <tr>
          <th className="py-1.5">Student</th>
          <th className="py-1.5">Activity</th>
          <th className="py-1.5">Status</th>
          <th className="py-1.5">Evidence</th>
          <th className="py-1.5" />
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {submissions.map((s) => (
          <tr key={s.id}>
            <td className="py-1.5">{s.student_name}</td>
            <td className="py-1.5">{s.activity_name}</td>
            <td className="py-1.5 capitalize">{s.status.replace("_", " ")}</td>
            <td className="py-1.5">
              {s.evidence_file_id ? (
                <a href={`/api/files/${s.evidence_file_id}`} target="_blank" rel="noreferrer" className="text-zinc-600 underline hover:text-zinc-900">
                  View
                </a>
              ) : (
                <span className="text-zinc-300">—</span>
              )}
            </td>
            <td className="py-1.5">
              <div className="flex gap-1">
                {canReview && s.status === "submitted" ? (
                  <>
                    <ActionButton action={verifySkillSubmissionAction} label="Verify" submissionId={s.id} />
                    <ActionButton action={rejectSkillSubmissionAction} label="Reject" submissionId={s.id} />
                    <ActionButton action={returnSkillSubmissionAction} label="Return" submissionId={s.id} />
                  </>
                ) : null}
                {canApprove && s.status === "pending_review" ? (
                  <ActionButton action={approveSkillSubmissionAction} label="Approve" submissionId={s.id} />
                ) : null}
              </div>
            </td>
          </tr>
        ))}
        {submissions.length === 0 ? (
          <tr><td colSpan={5} className="py-4 text-center text-zinc-400">—</td></tr>
        ) : null}
      </tbody>
    </table>
    </div>
  );
}
