"use client";

import { useActionState } from "react";
import { setCurrentAcademicYearAction } from "./actions";

/** "Archive previous year" (§Page-2 follow-up) — flips a DIFFERENT year to
 *  current; the year that was current becomes "archived" simply by no
 *  longer being is_current (see setCurrentAcademicYear() in
 *  modules/academic/service.ts). */
export default function SetCurrentYearButton({ academicYearId }: { academicYearId: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(setCurrentAcademicYearAction, { error: null });
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Set this as the current academic year? The previously current year will be archived.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300 disabled:opacity-50"
      >
        Set current
      </button>
      {state.error ? <span className="ml-2 text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
