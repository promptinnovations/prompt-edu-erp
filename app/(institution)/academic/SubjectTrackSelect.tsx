"use client";

import { useActionState } from "react";
import { updateSubjectTrackAction } from "./actions";

/** Inline retag control shown next to each subject only when this
 *  institution is in 'both' education mode (§ education-track follow-up)
 *  — lets an admin sort a subject into Academic/Islamic without a full
 *  edit form. Submits on change. */
export default function SubjectTrackSelect({ subjectId, track }: { subjectId: string; track: "academic" | "islamic" | null }) {
  const [, formAction] = useActionState<{ error: string | null }, FormData>(updateSubjectTrackAction, { error: null });
  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="subjectId" value={subjectId} />
      <select
        name="track"
        defaultValue={track ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
      >
        <option value="">Untagged</option>
        <option value="academic">Academic</option>
        <option value="islamic">Islamic</option>
      </select>
    </form>
  );
}
