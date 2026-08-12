"use client";

import { useActionState } from "react";
import { verifyAchievementAction, rejectAchievementAction, approveAchievementAction } from "./actions";

export interface AchievementRow {
  id: string; student_name: string; category_name: string; level_name: string;
  title: string; position: string | null; status: string; verified_by: string | null;
  certificate_file_id: string | null;
}

function ActionButton({ action, label, achievementId }: { action: typeof verifyAchievementAction; label: string; achievementId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="achievementId" value={achievementId} />
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export default function AchievementsTable({
  achievements,
  canVerify,
  canApprove,
}: {
  achievements: AchievementRow[];
  canVerify: boolean;
  canApprove: boolean;
}) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
        <tr>
          <th className="py-1.5">Student</th>
          <th className="py-1.5">Category</th>
          <th className="py-1.5">Level</th>
          <th className="py-1.5">Title</th>
          <th className="py-1.5">Status</th>
          <th className="py-1.5">Certificate</th>
          <th className="py-1.5" />
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {achievements.map((a) => (
          <tr key={a.id}>
            <td className="py-1.5">{a.student_name}</td>
            <td className="py-1.5">{a.category_name}</td>
            <td className="py-1.5">{a.level_name}</td>
            <td className="py-1.5">{a.title}{a.position ? ` (${a.position})` : ""}</td>
            <td className="py-1.5 capitalize">{a.status}</td>
            <td className="py-1.5">
              {a.certificate_file_id ? (
                <a href={`/api/files/${a.certificate_file_id}`} target="_blank" rel="noreferrer" className="text-zinc-600 underline hover:text-zinc-900">
                  View
                </a>
              ) : (
                <span className="text-zinc-300">—</span>
              )}
            </td>
            <td className="py-1.5">
              {a.status === "pending" ? (
                <div className="flex gap-1">
                  {canVerify && !a.verified_by ? (
                    <>
                      <ActionButton action={verifyAchievementAction} label="Verify" achievementId={a.id} />
                      <ActionButton action={rejectAchievementAction} label="Reject" achievementId={a.id} />
                    </>
                  ) : null}
                  {canApprove && a.verified_by ? (
                    <ActionButton action={approveAchievementAction} label="Approve" achievementId={a.id} />
                  ) : null}
                </div>
              ) : null}
            </td>
          </tr>
        ))}
        {achievements.length === 0 ? (
          <tr><td colSpan={7} className="py-4 text-center text-zinc-400">—</td></tr>
        ) : null}
      </tbody>
    </table>
    </div>
  );
}
