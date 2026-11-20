import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { listClasses } from "../../../../modules/academic/service";
import {
  getEvent, listItems, listEntries, getHouseLeaderboard, getChampions, EVENT_KINDS, EVENT_STATUSES, EVENT_STATUS_LABEL,
  type EventStatus,
} from "../../../../modules/events/service";
import { PageHeader, Panel, StatTile, EmptyNote } from "../../../components/portal/viz/blocks";
import { decorColor } from "../../../components/portal/viz/palette";
import { formatDateIST } from "../../../../services/datetime/ist";
import ActionForm from "../../../components/ui/ActionForm";
import { setEventStatusAction, updateEventAction, deleteEventAction } from "../actions";
import { inputClass, labelClass } from "../../../components/ui/form-classes";
import { StatusBadge, HouseBoard, Champions, PlaceBadge, HouseDot, KIND_LABEL } from "../parts";
import ItemForm from "../ItemForm";

const NEXT: Partial<Record<EventStatus, { to: EventStatus; label: string; note: string }>> = {
  draft: { to: "enrolment_open", label: "Open enrolment", note: "Staff can enter students, and students can enter themselves in individual items." },
  enrolment_open: { to: "enrolment_closed", label: "Close enrolment", note: "Entries are frozen and judges can start marking." },
  enrolment_closed: { to: "judging", label: "Start judging", note: "Judges enter marks; results update live for staff." },
  judging: { to: "published", label: "Publish results", note: "Results go to the student and parent portals and into each winner's portfolio." },
};

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "events");
  const canManage = ctx.isSuperAdmin || can(ctx.permissions, "events.manage");
  if (!canManage && !can(ctx.permissions, "events.view") && !can(ctx.permissions, "events.judge")) redirect("/dashboard");

  const event = await getEvent(institutionId, authUserId, id);
  if (!event || (!canManage && event.status === "draft")) notFound();
  const [items, board, champions, classes] = await Promise.all([
    listItems(institutionId, authUserId, id),
    getHouseLeaderboard(institutionId, authUserId, { eventId: id }),
    getChampions(institutionId, authUserId, id),
    listClasses(institutionId, authUserId),
  ]);
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const showResults = event.status === "judging" || event.status === "published";
  const entriesByItem = showResults ? await Promise.all(items.map((i) => listEntries(institutionId, authUserId, i.id))) : [];
  const next = NEXT[event.status];
  const totalEntries = items.reduce((a, i) => a + i.entry_count, 0);
  const marked = items.reduce((a, i) => a + i.scored_count, 0);
  const locked = event.status === "published";

  return (
    <div className="space-y-6">
      <PageHeader
        title={event.name}
        subtitle={`${KIND_LABEL[event.kind] ?? event.kind}${event.start_date ? ` · ${formatDateIST(event.start_date)}` : ""}${event.end_date && event.end_date !== event.start_date ? ` – ${formatDateIST(event.end_date)}` : ""}${event.description ? ` · ${event.description}` : ""}`}
        icon="🏆" color={decorColor(0)}
      >
        <StatusBadge status={event.status} />
      </PageHeader>

      {/* Stage stepper */}
      <Panel title="Stage" color={decorColor(1)}>
        <ol className="flex flex-wrap gap-2">
          {EVENT_STATUSES.map((s, i) => {
            const at = EVENT_STATUSES.indexOf(event.status);
            const done = i < at, current = i === at;
            return (
              <li key={s} className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${current ? "bg-[var(--brand)] text-white" : done ? "bg-primary-100 text-primary-800" : "border border-[var(--border-subtle)] text-zinc-500"}`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${current ? "bg-white/25" : done ? "bg-primary-600 text-white" : "bg-zinc-100"}`}>{done ? "✓" : i + 1}</span>
                {EVENT_STATUS_LABEL[s]}
              </li>
            );
          })}
        </ol>
        {canManage ? (
          <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-[var(--border-subtle)] pt-4">
            {next ? (
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-sm text-zinc-600">{next.note}</p>
                <ActionForm action={setEventStatusAction} submitLabel={next.label} confirm={next.to === "published" ? "Publish the results to students and parents?" : undefined}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="status" value={next.to} />
                </ActionForm>
              </div>
            ) : <p className="flex-1 text-sm text-zinc-600">Results are out. Move the event back to judging to correct marks — the portals hide the results until you publish again.</p>}
            <ActionForm action={setEventStatusAction} submitLabel="Move" variant="secondary" className="flex items-end gap-2">
              <input type="hidden" name="eventId" value={event.id} />
              <div>
                <label className={labelClass} htmlFor="ev-status">Or move to</label>
                <select id="ev-status" name="status" defaultValue={event.status} className={inputClass}>
                  {EVENT_STATUSES.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            </ActionForm>
          </div>
        ) : null}
      </Panel>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Items" value={items.length} icon="🎯" color={decorColor(0)} />
        <StatTile label="Entries" value={totalEntries} icon="✍️" color={decorColor(1)} />
        <StatTile label="Marked" value={`${marked}/${totalEntries}`} sub="entries with marks" icon="📝" color={decorColor(2)} />
        <StatTile label="Most items" value={event.max_items_per_student ?? "No limit"} sub="per student" icon="📌" color={decorColor(3)} />
      </div>

      <Panel title="Items" subtitle="The competitions in this event" color={decorColor(0)}>
        {items.length === 0 ? <EmptyNote>No items yet.{canManage ? " Add the first one below." : ""}</EmptyNote> : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                <tr><th className="py-1.5 pr-3">Item</th><th className="py-1.5 pr-3">Type</th><th className="py-1.5 pr-3">Who can enter</th><th className="py-1.5 pr-3">Entries</th><th className="py-1.5 pr-3">Judges</th><th className="py-1.5">Marked</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/events/${event.id}/items/${it.id}`} className="font-medium text-[var(--brand)] hover:underline">{it.name}</Link>
                      {it.category ? <div className="text-xs text-zinc-500">{it.category}</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-zinc-600">{it.participation === "group" ? `Group (up to ${it.team_size_max})` : "Individual"}</td>
                    <td className="py-2 pr-3 text-zinc-600">
                      {it.eligible_class_ids ? it.eligible_class_ids.map((c) => className.get(c) ?? "?").join(", ") : "All classes"}
                      {it.gender ? ` · ${it.gender === "male" ? "Boys" : "Girls"}` : ""}
                    </td>
                    <td className="py-2 pr-3">{it.entry_count}</td>
                    <td className="py-2 pr-3">{it.judge_count || <span className="text-accent-700">None</span>}</td>
                    <td className="py-2">{it.scored_count}/{it.entry_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage && !locked ? (
          <details className="mt-4 rounded-xl border border-[var(--border-subtle)] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--brand)]">+ Add an item</summary>
            <div className="mt-4"><ItemForm eventId={event.id} classes={classes.map((c) => ({ id: c.id, name: c.name }))} /></div>
          </details>
        ) : null}
      </Panel>

      {showResults ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Panel title="House leader board" subtitle={event.status === "published" ? "Final" : "Live — not yet published"} color={decorColor(1)}>
              <HouseBoard rows={board} />
            </Panel>
            <Panel title="Individual champions" subtitle="Points from individual items" color={decorColor(2)}>
              <Champions rows={champions} />
            </Panel>
          </div>
          <Panel title="Results by item" color={decorColor(3)}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it, n) => {
                const placed = (entriesByItem[n] ?? []).filter((e) => e.position).sort((a, b) => (a.position ?? 9) - (b.position ?? 9));
                return (
                  <div key={it.id} className="rounded-xl border border-[var(--border-subtle)] p-3">
                    <Link href={`/events/${event.id}/items/${it.id}`} className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--brand)]">{it.name}</Link>
                    {placed.length === 0 ? <p className="mt-1 text-xs text-zinc-400">No marks yet.</p> : (
                      <ul className="mt-2 space-y-1.5">
                        {placed.map((e) => (
                          <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-1.5"><HouseDot color={e.house_color} size={8} /><span className="truncate">{e.team_name ?? e.members.map((m) => m.full_name).join(", ")}</span></span>
                            <PlaceBadge position={e.position} grade={e.grade} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </>
      ) : null}

      {canManage ? (
        <Panel title="Event details" color={decorColor(4)}>
          <ActionForm action={updateEventAction} submitLabel="Save details" className="space-y-3">
            <input type="hidden" name="eventId" value={event.id} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ed-name">Event name</label>
                <input id="ed-name" name="name" defaultValue={event.name} required maxLength={120} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="ed-kind">Type</label>
                <select id="ed-kind" name="kind" defaultValue={event.kind} className={inputClass}>
                  {EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="ed-max">Most items per student</label>
                <input id="ed-max" name="maxItemsPerStudent" type="number" min={1} max={50} defaultValue={event.max_items_per_student ?? ""} placeholder="No limit" className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="ed-start">Starts</label>
                <input id="ed-start" name="startDate" type="date" defaultValue={event.start_date ?? ""} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="ed-end">Ends</label>
                <input id="ed-end" name="endDate" type="date" defaultValue={event.end_date ?? ""} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ed-desc">Description</label>
                <input id="ed-desc" name="description" defaultValue={event.description ?? ""} maxLength={2000} className={inputClass} />
              </div>
              {(["A", "B", "C"] as const).map((g) => (
                <div key={g}>
                  <label className={labelClass} htmlFor={`ed-g${g}`}>Grade {g} from (%)</label>
                  <input id={`ed-g${g}`} name={`grade${g}Min`} type="number" min={0} max={100} step="0.5"
                    defaultValue={g === "A" ? event.grade_a_min : g === "B" ? event.grade_b_min : event.grade_c_min} className={inputClass} />
                </div>
              ))}
            </div>
          </ActionForm>
          <div className="mt-4 flex justify-end border-t border-[var(--border-subtle)] pt-4">
            <ActionForm action={deleteEventAction} submitLabel="Delete event" variant="danger" confirm={`Delete ${event.name} with all its items, entries and marks?`}>
              <input type="hidden" name="eventId" value={event.id} />
            </ActionForm>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
