import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listEvents, listHouses, getHouseLeaderboard, listMyJudgingItems, EVENT_KINDS } from "../../../modules/events/service";
import { PageHeader, Panel, StatTile, EmptyNote } from "../../components/portal/viz/blocks";
import { decorColor } from "../../components/portal/viz/palette";
import { formatDateIST } from "../../../services/datetime/ist";
import ActionForm from "./ActionForm";
import { createEventAction } from "./actions";
import { inputClass, labelClass } from "./ui";
import { StatusBadge, HouseBoard, KIND_LABEL } from "./parts";

export default async function EventsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "events");
  const canManage = ctx.isSuperAdmin || can(ctx.permissions, "events.manage");
  const canJudge = can(ctx.permissions, "events.judge");
  if (!canManage && !canJudge && !can(ctx.permissions, "events.view")) redirect("/dashboard");

  const [events, houses, board, judging] = await Promise.all([
    listEvents(institutionId, authUserId, { visibleOnly: !canManage }),
    listHouses(institutionId, authUserId),
    getHouseLeaderboard(institutionId, authUserId),
    canJudge ? listMyJudgingItems(institutionId, authUserId, ctx.userId) : Promise.resolve([]),
  ]);
  const entries = events.reduce((a, e) => a + e.entry_count, 0);
  const published = events.filter((e) => e.status === "published").length;
  const assigned = houses.reduce((a, h) => a + h.member_count, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Events & Activities" subtitle="Houses, competitions, enrolment, judging and results — this academic year" icon="🏆" color={decorColor(0)}>
        {canManage ? (
          <Link href="/events/houses" className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-primary-50">Houses</Link>
        ) : null}
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Events" value={events.length} sub={`${published} with results out`} icon="📅" color={decorColor(0)} />
        <StatTile label="Entries" value={entries} sub="students & teams entered" icon="✍️" color={decorColor(1)} />
        <StatTile label="Houses" value={houses.length} sub={`${assigned} students placed`} icon="👥" color={decorColor(2)} href={canManage ? "/events/houses" : undefined} />
        <StatTile label="To judge" value={judging.length} sub="items assigned to you" icon="⭐" color={decorColor(3)} />
      </div>

      {judging.length > 0 ? (
        <Panel title="My judging" subtitle="Enter marks for the items you are judging" color={decorColor(3)}>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {judging.map((j) => (
              <li key={j.item_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-[var(--foreground)]">{j.item_name}</div>
                  <div className="text-xs text-zinc-500">{j.event_name} · {j.my_scored}/{j.entry_count} marked</div>
                </div>
                <Link href={`/events/${j.event_id}/items/${j.item_id}#marks`} className="rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--brand-hover)]">Enter marks</Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Events this year" color={decorColor(0)}>
          {events.length === 0 ? (
            <EmptyNote>No events yet.{canManage ? " Create the first one below." : ""}</EmptyNote>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {events.map((e, i) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="block h-full rounded-xl border border-[var(--border-subtle)] p-4 transition-shadow hover:shadow-raised" style={{ borderLeft: `4px solid ${decorColor(i)}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-words font-semibold text-[var(--foreground)]">{e.name}</div>
                        <div className="text-xs text-zinc-500">
                          {KIND_LABEL[e.kind] ?? e.kind}{e.start_date ? ` · ${formatDateIST(e.start_date)}` : ""}{e.end_date && e.end_date !== e.start_date ? ` – ${formatDateIST(e.end_date)}` : ""}
                        </div>
                      </div>
                      <StatusBadge status={e.status} />
                    </div>
                    <div className="mt-3 flex gap-4 text-xs text-zinc-600">
                      <span><b className="text-[var(--foreground)]">{e.item_count}</b> items</span>
                      <span><b className="text-[var(--foreground)]">{e.entry_count}</b> entries</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="House leader board" subtitle="All events this year" color={decorColor(1)}>
          {houses.length === 0 ? (
            <EmptyNote>{canManage ? <>No houses yet — <Link className="text-[var(--brand)] underline" href="/events/houses">add houses</Link>.</> : "No houses yet."}</EmptyNote>
          ) : (
            <HouseBoard rows={board} />
          )}
        </Panel>
      </div>

      {canManage ? (
        <Panel title="Create an event" subtitle="Start as a draft, add its items, then open enrolment" color={decorColor(2)}>
          <ActionForm action={createEventAction} submitLabel="Create event" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ev-name">Event name</label>
                <input id="ev-name" name="name" required maxLength={120} placeholder="e.g. Arts Fest 2026" className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="ev-kind">Type</label>
                <select id="ev-kind" name="kind" defaultValue="arts" className={inputClass}>
                  {EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="ev-max">Most items per student</label>
                <input id="ev-max" name="maxItemsPerStudent" type="number" min={1} max={50} placeholder="No limit" className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="ev-start">Starts</label>
                <input id="ev-start" name="startDate" type="date" className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="ev-end">Ends</label>
                <input id="ev-end" name="endDate" type="date" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ev-desc">Description (optional)</label>
                <input id="ev-desc" name="description" maxLength={2000} className={inputClass} />
              </div>
            </div>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}
