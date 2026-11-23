/**
 * "Substitutions for you" — the periods this teacher has been asked to cover
 * (today and the coming week). Each pending card is itself the confirm button:
 * one tap signs that they have taken the period. Used on the Dashboard and on
 * the Timetable page.
 */
import type { ReactNode } from "react";
import type { SubstitutionRow } from "../../../modules/substitution/service";
import { formatDateIST, formatTimeIST } from "../../../services/datetime/ist";
import { Panel } from "../portal/viz/blocks";
import { tint, STATUS_COLOR } from "../portal/viz/palette";
import AckSubstitutionButton from "../../(institution)/timetable/AckSubstitutionButton";

export default function MySubstitutions({ subs, today, action }: { subs: SubstitutionRow[]; today: string; action?: ReactNode }) {
  const waiting = subs.filter((s) => !s.acknowledgedAt).length;
  return (
    <Panel
      title="Substitutions for you"
      subtitle={waiting > 0 ? `${waiting} waiting for your confirmation — tap a highlighted period to confirm that you will take it` : "All confirmed — thank you"}
      color={waiting > 0 ? STATUS_COLOR.late : STATUS_COLOR.present}
      action={action}
    >
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {subs.map((s) => {
          const done = !!s.acknowledgedAt;
          const c = done ? STATUS_COLOR.present : STATUS_COLOR.late;
          const body = (
            <div className="px-3 py-2.5 text-left text-[var(--foreground)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-600">
                {s.date === today ? "Today" : formatDateIST(s.date, { weekday: "short", day: "numeric", month: "short" })} · Period {s.periodNo}
              </div>
              <div className="mt-0.5 text-sm font-semibold">{s.className} {s.sectionName}{s.subjectName ? ` · ${s.subjectName}` : ""}</div>
              <div className="text-xs text-zinc-600">Covering for {s.absentStaffName}</div>
              <div className="mt-1.5 text-xs font-semibold" style={{ color: done ? c : undefined }}>
                {done ? `✓ Confirmed ${formatTimeIST(s.acknowledgedAt!)}` : "Tap to confirm"}
              </div>
            </div>
          );
          return (
            <li key={s.id} className="overflow-hidden rounded-lg" style={{ backgroundColor: tint(c, 0.2), borderLeft: `4px solid ${c}` }}>
              {done
                ? body
                : <AckSubstitutionButton substitutionId={s.id} className="block w-full cursor-pointer hover:brightness-95" title="Tap to confirm that you will take this period">{body}</AckSubstitutionButton>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
