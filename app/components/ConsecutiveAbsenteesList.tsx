/**
 * PROMPT EDU ERP — Dashboard follow-up ("children absent for more than 3
 * consecutive days also should be shown"). Renders
 * getConsecutiveAbsentees()'s rows (modules/attendance/service.ts) — each
 * one already IS an ongoing 3+-day absence streak reaching up to the
 * student's latest attendance record, so this component is pure display,
 * no further filtering.
 */
import type { ConsecutiveAbsenteeRow } from "../../modules/attendance/service";

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function ConsecutiveAbsenteesList({ rows }: { rows: ConsecutiveAbsenteeRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-400">No student has been absent 3+ days in a row right now.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-100">
      {rows.map((r) => (
        <li key={r.studentId} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-800">{r.studentName}</p>
            <p className="truncate text-xs text-zinc-400">
              {r.className} · {r.sectionName}
              {r.stage ? ` · ${r.stage}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
              {r.streakLength} days
            </span>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              since {formatDate(r.streakStart)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
