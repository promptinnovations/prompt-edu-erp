"use client";

import { useActionState } from "react";
import { updateParentPortalSectionsAction } from "./actions";

const LABELS: Record<string, string> = {
  results: "Exam results",
  attendance: "Attendance",
  discipline: "Discipline",
  achievements: "Achievements",
  library: "Library / reading record",
  skills: "Skills",
  portfolio: "Portfolio timeline",
  character: "Character assessments",
  mentoring: "Mentoring notes",
};

/** §Page-3 follow-up "Student Portfolio Management — designing children's
 *  page, what should be shown in the Parent portal" — one checkbox per
 *  section; app/(portals)/portal/parent/page.tsx reads this same
 *  ParentPortalSections shape to decide what to render. */
export default function ParentPortalSectionsForm({ sections }: { sections: Record<string, boolean> }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(
    updateParentPortalSectionsAction, { error: null }
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.entries(LABELS).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" name={key} defaultChecked={sections[key] !== false} />
            {label}
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        Save
      </button>
      {state.error ? <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p> : null}
    </form>
  );
}
