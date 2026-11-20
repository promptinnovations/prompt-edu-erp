import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { getHomeworkDetail } from "../../../../modules/homework/service";
import { PageHeader, Panel } from "../../../components/portal/viz/blocks";
import { decorColor } from "../../../components/portal/viz/palette";
import ActionForm from "../../../components/ui/ActionForm";
import { formatDateIST } from "../../../../services/datetime/ist";
import { saveTicksAction } from "../actions";

/** One piece of homework: who has ticked it done; the teacher can tick for them. */
export default async function HomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  if (!ctx.isSuperAdmin && !can(ctx.permissions, "homework.set")) redirect("/dashboard");
  const detail = await getHomeworkDetail(ctx.institutionId!, ctx.session.authUserId, id);
  if (!detail) notFound();
  const h = detail.homework;
  const done = detail.students.filter((s) => s.done).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={h.title}
        subtitle={`${h.class_name}${h.section_name ? ` ${h.section_name}` : " (all divisions)"}${h.subject_name ? ` · ${h.subject_name}` : ""} · due ${formatDateIST(h.due_date)}${h.set_by ? ` · set by ${h.set_by}` : ""}`}
        icon="📝" color={decorColor(0)}
      >
        <Link href="/homework" className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-primary-50">← Homework</Link>
      </PageHeader>
      {h.details ? <Panel title="Details" color={decorColor(3)}><p className="whitespace-pre-line text-sm text-zinc-700">{h.details}</p></Panel> : null}
      <Panel title="Done" subtitle={`${done} of ${detail.students.length} ticked done — students tick it in their portal, or tick it for them here`} color={decorColor(1)}>
        <ActionForm action={saveTicksAction} submitLabel="Save ticks" className="space-y-3">
          <input type="hidden" name="homeworkId" value={h.id} />
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {detail.students.map((s) => (
              <li key={s.student_id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm has-[:checked]:border-[var(--brand)] has-[:checked]:bg-primary-50">
                  <input type="checkbox" name="done" value={s.student_id} defaultChecked={s.done} className="accent-[var(--brand)]" />
                  <span className="min-w-0 flex-1 truncate">{s.full_name}</span>
                  <span className="text-xs text-zinc-400">{s.section_name ?? ""}{s.roll_number ? ` · ${s.roll_number}` : ""}</span>
                </label>
              </li>
            ))}
          </ul>
        </ActionForm>
      </Panel>
    </div>
  );
}
