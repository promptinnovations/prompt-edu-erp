"use client";

/** §137 follow-up "roll number should be male first ... then girls" — one
 *  button per division on the class detail page that recomputes the whole
 *  division's roll numbers via modules/students/service.ts's
 *  assignRollNumbers(). */
import { useActionState } from "react";
import { recomputeRollNumbersAction } from "../students/actions";

const initialState = { error: null as string | null, count: undefined as number | undefined };

export default function RecomputeRollNumbersButton({
  classId, sectionId, academicYearId,
}: { classId: string; sectionId: string; academicYearId: string }) {
  const [state, formAction, pending] = useActionState(recomputeRollNumbersAction, initialState);

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-indigo-600 underline hover:text-indigo-800 disabled:opacity-50"
      >
        {pending ? "Computing…" : "Recompute roll numbers"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      {state.count !== undefined && !state.error ? <span className="text-xs text-emerald-600">Done ({state.count})</span> : null}
    </form>
  );
}
