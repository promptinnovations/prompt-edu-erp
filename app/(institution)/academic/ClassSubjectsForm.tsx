"use client";

import { useActionState } from "react";
import { assignClassSubjectAction, removeClassSubjectAction } from "./actions";

/** §137 follow-up ("subjects should be visible in classes as well") — the
 *  management side of class_subjects, which until now had no UI anywhere
 *  (see modules/academic/service.ts's listClassSubjects() header comment).
 *  One row per class: its currently assigned subjects (removable) plus an
 *  add-subject select drawing from every subject already defined above on
 *  this same page. */
export default function ClassSubjectsForm({
  classId,
  className,
  assigned,
  availableSubjects,
  canManage,
}: {
  classId: string;
  className: string;
  assigned: { subjectId: string; subjectName: string }[];
  availableSubjects: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [assignState, assignAction, assignPending] = useActionState<{ error: string | null }, FormData>(assignClassSubjectAction, { error: null });
  const [removeState, removeAction] = useActionState<{ error: string | null }, FormData>(removeClassSubjectAction, { error: null });

  const assignedIds = new Set(assigned.map((a) => a.subjectId));
  const remaining = availableSubjects.filter((s) => !assignedIds.has(s.id));

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{className}</span>
        {assigned.length === 0 ? (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">No subjects assigned yet.</span>
        ) : (
          assigned.map((a) => (
            <span
              key={a.subjectId}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300"
            >
              {a.subjectName}
              {canManage ? (
                <form action={removeAction} className="inline">
                  <input type="hidden" name="classId" value={classId} />
                  <input type="hidden" name="subjectId" value={a.subjectId} />
                  <button type="submit" className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400" aria-label={`Remove ${a.subjectName}`}>
                    ×
                  </button>
                </form>
              ) : null}
            </span>
          ))
        )}
      </div>
      {canManage && remaining.length > 0 ? (
        <form action={assignAction} className="mt-1 flex items-center gap-2">
          <input type="hidden" name="classId" value={classId} />
          <select
            name="subjectId"
            required
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          >
            {remaining.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="submit" disabled={assignPending} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
            Add subject
          </button>
        </form>
      ) : null}
      {assignState.error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{assignState.error}</p> : null}
      {removeState.error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{removeState.error}</p> : null}
    </li>
  );
}
