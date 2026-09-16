"use client";

import { useActionState } from "react";
import { updateBoardAction } from "./actions";

export default function BoardConfigForm({
  institutionId,
  institutionType,
  board,
}: {
  institutionId: string;
  institutionType: string;
  board: string | null;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null; saved?: boolean }, FormData>(
    updateBoardAction,
    { error: null }
  );
  const isSchool = institutionType === "school";

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="institutionId" value={institutionId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500">{isSchool ? "Board" : "Educational board"}</label>
        <select
          name="board"
          defaultValue={board ?? (isSchool ? "kerala_state" : "sksvb")}
          className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          {isSchool ? (
            <>
              <option value="kerala_state">Kerala State</option>
              <option value="cbse">CBSE</option>
              <option value="icse">ICSE</option>
            </>
          ) : (
            <>
              <option value="sksvb">SKSVB</option>
              <option value="skimvb">SKIMVB</option>
            </>
          )}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        Save
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      {state.saved ? <span className="text-sm text-emerald-600">Saved.</span> : null}
      <p className="w-full text-[11px] text-zinc-500">
        {isSchool
          ? "(Re-)creates a matching default grading scale (grade bands + pass %) for this institution — safe to run again; a fresh scale is added and marked default each time."
          : "Setting SKSVB (re-)creates classes 1–12 and their subjects for this institution — safe to run again, existing classes/subjects are matched by name, never duplicated."}
      </p>
    </form>
  );
}
