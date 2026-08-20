import ObservationForm from "../ObservationForm";
import RubricAdminSection from "../RubricAdminSection";
import type { ObservationCriterionRecord, TeacherObservationRecord } from "../../../../modules/staff/service";

interface ParsedObservationPayload {
  term?: string | null;
  classDiv?: string | null;
  content?: string | null;
  totalScore?: number | null;
}

function parsePayload(raw: unknown): ParsedObservationPayload {
  if (!raw || typeof raw !== "object") return {};
  return raw as ParsedObservationPayload;
}

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * §Teacher-Profile feature ("Term-wise Performance observation by principal
 * and section heads... one observation each term") — the rubric-driven
 * form (canRecord), a chronological list of past observations for this
 * teacher (Year-wise Performance History, in effect — every term's
 * observation is already timestamped and kept, nothing overwrites a prior
 * term), and, for unrestricted observers only, the rubric admin panel.
 */
export default function ObservationsSection({
  teacherId, criteria, observations, canRecord, canManageRubric,
}: {
  teacherId: string;
  criteria: ObservationCriterionRecord[];
  observations: TeacherObservationRecord[];
  canRecord: boolean;
  canManageRubric: boolean;
}) {
  return (
    <div className="space-y-6">
      {canRecord ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">New classroom observation</h2>
          {criteria.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">No observation rubric configured yet.</p>
          ) : (
            <ObservationForm teacherId={teacherId} criteria={criteria} />
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Observation history</h2>
        {observations.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No observations recorded yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {observations.map((o) => {
              const payload = parsePayload(o.criteria_jsonb);
              return (
                <li key={o.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {formatDate(o.date)}{payload.term ? ` · ${payload.term}` : ""}{payload.classDiv ? ` · ${payload.classDiv}` : ""}
                    </div>
                    {payload.totalScore !== undefined && payload.totalScore !== null ? (
                      <span className="rounded-full bg-[var(--brand)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--brand)]">
                        {payload.totalScore}/100
                      </span>
                    ) : null}
                  </div>
                  {payload.content ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{payload.content}</p> : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {o.overall_notes ? (
                      <div>
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Strengths observed</div>
                        <div className="text-sm text-zinc-700 dark:text-zinc-300">{o.overall_notes}</div>
                      </div>
                    ) : null}
                    {o.follow_up_notes ? (
                      <div>
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Areas to improve</div>
                        <div className="text-sm text-zinc-700 dark:text-zinc-300">{o.follow_up_notes}</div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canManageRubric ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Observation rubric (admin)</h2>
          <RubricAdminSection criteria={criteria} />
        </section>
      ) : null}
    </div>
  );
}
