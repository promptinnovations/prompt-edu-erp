import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listHomeworkTargets, listHomeworkForStaff } from "../../../modules/homework/service";
import { PageHeader, Panel, StatTile, EmptyNote } from "../../components/portal/viz/blocks";
import { decorColor, tint } from "../../components/portal/viz/palette";
import ActionForm from "../../components/ui/ActionForm";
import { inputClass, labelClass } from "../../components/ui/form-classes";
import { formatDateIST, todayIST } from "../../../services/datetime/ist";
import { createHomeworkAction, deleteHomeworkAction } from "./actions";

/**
 * Homework (migration 0072) — teachers set homework for the classes and
 * subjects they teach; students see it in their portal and tick it done.
 */
export default async function HomeworkPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  if (!ctx.isSuperAdmin && !can(ctx.permissions, "homework.set")) redirect("/dashboard");
  const broad = ctx.isSuperAdmin || can(ctx.permissions, "settings.manage") || can(ctx.permissions, "marks.approve");

  const [targets, list] = await Promise.all([
    listHomeworkTargets(institutionId, authUserId, ctx.userId, broad),
    listHomeworkForStaff(institutionId, authUserId, ctx.userId, { broad }),
  ]);
  const today = todayIST();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const open = list.filter((h) => h.due_date >= today);
  const avgDone = list.length ? Math.round(list.reduce((a, h) => a + (h.student_count ? h.done_count / h.student_count : 0), 0) / list.length * 100) : 0;
  const label = (t: { class_name: string; section_name: string | null; subject_name: string | null }) =>
    `${t.class_name}${t.section_name ? ` ${t.section_name}` : " (all divisions)"}${t.subject_name ? ` · ${t.subject_name}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Homework" subtitle={broad ? "Every class's homework this year" : "Homework for the classes you teach"} icon="📝" color={decorColor(0)} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Set this year" value={list.length} icon="📝" color={decorColor(0)} />
        <StatTile label="Still open" value={open.length} sub="due today or later" icon="⏳" color={decorColor(1)} />
        <StatTile label="Done on average" value={`${avgDone}%`} sub="of each class ticked done" icon="👍" color={decorColor(2)} />
        <StatTile label="Classes" value={new Set(targets.map((t) => `${t.class_id}|${t.section_id}`)).size} sub={broad ? "in the school" : "you teach"} icon="🏫" color={decorColor(3)} />
      </div>

      <Panel title="Set homework" color={decorColor(1)}>
        {targets.length === 0 ? (
          <EmptyNote>{broad ? "Add subjects to classes first (Academic Structure)." : "You have no classes assigned this year — ask the office to add your teacher assignments."}</EmptyNote>
        ) : (
          <ActionForm action={createHomeworkAction} submitLabel="Set homework" resetOnSuccess className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="hw-target">Class and subject</label>
                <select id="hw-target" name="target" required defaultValue="" className={inputClass}>
                  <option value="" disabled>Choose…</option>
                  {targets.map((t) => (
                    <option key={`${t.class_id}|${t.section_id ?? ""}|${t.subject_id ?? ""}`} value={`${t.class_id}|${t.section_id ?? ""}|${t.subject_id ?? ""}`}>{label(t)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="hw-due">Due</label>
                <input id="hw-due" name="dueDate" type="date" required min={today} defaultValue={tomorrow} className={inputClass} />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className={labelClass} htmlFor="hw-title">Homework</label>
                <input id="hw-title" name="title" required maxLength={200} placeholder="e.g. Exercise 4.2, questions 1–10" className={inputClass} />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className={labelClass} htmlFor="hw-details">Details (optional)</label>
                <textarea id="hw-details" name="details" rows={2} maxLength={4000} className={inputClass} />
              </div>
            </div>
          </ActionForm>
        )}
      </Panel>

      <Panel title="Homework" subtitle="Tap one to see who has done it" color={decorColor(0)}>
        {list.length === 0 ? <EmptyNote>No homework set yet.</EmptyNote> : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {list.map((h) => {
              const pct = h.student_count ? Math.round((h.done_count / h.student_count) * 100) : 0;
              const past = h.due_date < today;
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="w-16 shrink-0 text-center">
                    <div className={`text-xs font-semibold ${past ? "text-zinc-400" : "text-accent-700"}`}>{past ? "Was due" : h.due_date === today ? "Due today" : "Due"}</div>
                    <div className="text-sm font-semibold text-[var(--foreground)]">{formatDateIST(h.due_date).replace(/ \d{4}$/, "")}</div>
                  </div>
                  <Link href={`/homework/${h.id}`} className="min-w-[11rem] flex-1">
                    <div className="truncate font-medium text-[var(--foreground)] hover:text-[var(--brand)]">{h.title}</div>
                    <div className="text-xs text-zinc-500">{label(h)}{broad && h.set_by ? ` · ${h.set_by}` : ""}</div>
                  </Link>
                  <div className="w-full sm:w-36 sm:shrink-0">
                    <div className="mb-1 flex justify-between text-xs text-zinc-500"><span>Done</span><span><b className="text-[var(--foreground)]">{h.done_count}</b>/{h.student_count}</span></div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: tint(decorColor(0), 0.14) }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: decorColor(0) }} />
                    </div>
                  </div>
                  {broad || h.created_by === ctx.userId ? (
                    <ActionForm action={deleteHomeworkAction} submitLabel="Remove" variant="danger" confirm={`Remove "${h.title}"?`}>
                      <input type="hidden" name="homeworkId" value={h.id} />
                    </ActionForm>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
