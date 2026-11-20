/**
 * Student / parent portal → Homework & syllabus (migration 0072). Homework
 * still to do (with a "Done" tick for the student), the recent past, and
 * syllabus progress per subject from the teachers' portion plans.
 */
import type { StudentHomework, SyllabusSubject } from "../../../modules/homework/service";
import { Panel, EmptyNote, StatTile } from "./viz/blocks";
import { decorColor, tint } from "./viz/palette";
import ActionForm, { type ActionResult } from "../ui/ActionForm";
import { formatDateIST } from "../../../services/datetime/ist";

type Act = (p: ActionResult, fd: FormData) => Promise<ActionResult>;

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: tint(color, 0.14) }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(pct > 0 ? 3 : 0, Math.min(100, pct))}%`, backgroundColor: color }} />
    </div>
  );
}

export default function HomeworkView({ homework, syllabus, tick }: { homework: StudentHomework[]; syllabus: SyllabusSubject[]; tick?: Act }) {
  const open = homework.filter((h) => !h.overdue);
  const past = homework.filter((h) => h.overdue).slice(0, 20);
  const toDo = open.filter((h) => !h.done).length;
  const doneAll = homework.length ? Math.round((homework.filter((h) => h.done).length / homework.length) * 100) : 0;
  const syllabusAvg = syllabus.length ? Math.round(syllabus.reduce((a, s) => a + s.average, 0) / syllabus.length) : 0;

  const row = (h: StudentHomework) => (
    <li key={h.id} className="flex flex-wrap items-start gap-3 py-3">
      <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${h.done ? "bg-[#15803d] text-white" : "border-2 border-[var(--border-subtle)]"}`}>{h.done ? "✓" : ""}</span>
      <div className="min-w-0 flex-1">
        <div className={`font-medium ${h.done ? "text-zinc-500 line-through decoration-zinc-300" : "text-[var(--foreground)]"}`}>{h.title}</div>
        <div className="text-xs text-zinc-500">{h.subject_name ?? "General"} · due {formatDateIST(h.due_date)}{h.set_by ? ` · ${h.set_by}` : ""}</div>
        {h.details ? <p className="mt-1 whitespace-pre-line text-sm text-zinc-600">{h.details}</p> : null}
      </div>
      {tick && !h.overdue ? (
        <ActionForm action={tick} submitLabel={h.done ? "Not done yet" : "Mark done"} variant={h.done ? "secondary" : "primary"}
          buttonClassName={h.done ? undefined : "rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"}>
          <input type="hidden" name="homeworkId" value={h.id} />
          <input type="hidden" name="done" value={h.done ? "0" : "1"} />
        </ActionForm>
      ) : !h.done && h.overdue ? <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-800">Not done</span> : null}
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="To do" value={toDo} sub="homework due today or later" icon="📝" color={decorColor(1)} />
        <StatTile label="Done" value={`${doneAll}%`} sub="of this year's homework" icon="👍" color={decorColor(0)} />
        <div className="col-span-2 lg:col-span-1">
          <StatTile label="Syllabus covered" value={`${syllabusAvg}%`} sub={syllabus.length ? `across ${syllabus.length} subject${syllabus.length === 1 ? "" : "s"}` : "no chapter plans yet"} icon="📖" color={decorColor(2)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel title="Homework" subtitle="Due today or later" color={decorColor(1)}>
            {open.length === 0 ? <EmptyNote>No homework due right now.</EmptyNote> : <ul className="divide-y divide-[var(--border-subtle)]">{open.map(row)}</ul>}
          </Panel>
          {past.length ? (
            <Panel title="Earlier homework" color={decorColor(3)}>
              <ul className="divide-y divide-[var(--border-subtle)]">{past.map(row)}</ul>
            </Panel>
          ) : null}
        </div>
        <Panel title="Syllabus progress" subtitle="Chapters covered in class, as recorded by the teachers" color={decorColor(2)}>
          {syllabus.length === 0 ? <EmptyNote>The teachers haven&apos;t shared chapter plans yet.</EmptyNote> : (
            <div className="space-y-4">
              {syllabus.map((s, i) => (
                <details key={s.subject_name} className="group">
                  <summary className="cursor-pointer list-none">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-[var(--foreground)]">{s.subject_name}</span>
                      <span className="text-xs text-zinc-500"><b className="text-[var(--foreground)]">{s.average}%</b> · {s.done}/{s.chapters.length} chapters</span>
                    </div>
                    <Bar pct={s.average} color={decorColor(i)} />
                  </summary>
                  <ul className="mt-2 space-y-1 border-l border-[var(--border-subtle)] pl-3">
                    {s.chapters.map((c) => (
                      <li key={c.chapter_name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-zinc-700">{c.chapter_name}</span>
                        <span className={(c.percent ?? 0) >= 100 ? "font-semibold text-[#15803d]" : "text-zinc-500"}>{c.percent === null ? "Not started" : `${c.percent}%`}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
