/**
 * Student / parent portal → Events & houses (migration 0070). The child's
 * house, the house standings (published events only), each event's entries
 * with results once published, and — for the student, while an event's
 * enrolment is open — the individual items they can still enter.
 */
import type { StudentEventsView } from "../../../modules/events/service";
import { EVENT_STATUS_LABEL } from "../../../modules/events/service";
import { Panel, EmptyNote, StatTile } from "./viz/blocks";
import { decorColor, tint } from "./viz/palette";
import { HouseBoard, PlaceBadge, HouseDot, fmt, KIND_LABEL } from "../../(institution)/events/parts";
import ActionForm, { type ActionResult } from "../ui/ActionForm";
import { formatDateIST } from "../../../services/datetime/ist";

type Act = (p: ActionResult, fd: FormData) => Promise<ActionResult>;

export default function EventsView({ view, who, enrol, withdraw }: { view: StudentEventsView; who: string; enrol?: Act; withdraw?: Act }) {
  const published = view.events.filter((e) => e.status === "published");
  const results = published.flatMap((e) => e.myEntries).filter((x) => x.position || x.grade);
  const points = published.flatMap((e) => e.myEntries).reduce((a, x) => a + (x.points ?? 0), 0);
  const rank = view.house ? view.standings.findIndex((s) => s.house_id === view.house!.id) + 1 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="col-span-2 flex items-center gap-4 rounded-card border p-4 shadow-card"
          style={{ borderColor: tint(view.house?.color ?? "#a4aab0", 0.4), backgroundImage: `linear-gradient(150deg, ${tint(view.house?.color ?? "#a4aab0", 0.16)}, transparent 70%)` }}>
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ backgroundColor: view.house?.color ?? "#a4aab0" }}>
            {view.house ? view.house.name.charAt(0).toUpperCase() : "?"}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-zinc-500">{who} house</div>
            <div className="truncate text-lg font-semibold text-[var(--foreground)]">{view.house?.name ?? "Not placed yet"}</div>
            {rank ? <div className="text-xs text-zinc-500">{rank === 1 ? "Leading" : `${rank}${rank === 2 ? "nd" : rank === 3 ? "rd" : "th"} place`} this year</div> : null}
          </div>
        </div>
        <StatTile label="Prizes & grades" value={results.length} sub="in published results" icon="🏅" color={decorColor(1)} />
        <StatTile label="Points earned" value={fmt(points)} sub={view.house ? `for ${view.house.name}` : "for the house"} icon="⭐" color={decorColor(0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {view.events.length === 0 ? <Panel title="Events"><EmptyNote>No events have been announced yet.</EmptyNote></Panel> : null}
          {view.events.map((e, n) => {
            const canEnter = enrol && e.status === "enrolment_open";
            const open = e.openItems.filter((i) => !i.enrolled_entry_id);
            return (
              <Panel key={e.id} title={e.name}
                subtitle={`${KIND_LABEL[e.kind] ?? e.kind}${e.start_date ? ` · ${formatDateIST(e.start_date)}` : ""} · ${EVENT_STATUS_LABEL[e.status]}`}
                color={decorColor(n)}>
                {e.myEntries.length === 0 ? <EmptyNote>{who === "Your" ? "You haven't" : "Not"} entered any item yet.</EmptyNote> : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {e.myEntries.map((x) => (
                      <li key={x.entry_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--foreground)]">{x.item_name}</div>
                          <div className="text-xs text-zinc-500">Entry no. {x.entry_no}{x.team_name ? ` · ${x.team_name}` : ""}{x.status !== "enrolled" ? ` · ${x.status}` : ""}</div>
                        </div>
                        {e.status === "published" ? (
                          <span className="flex items-center gap-2"><PlaceBadge position={x.position} grade={x.grade} />{x.points ? <span className="text-xs font-semibold text-zinc-600">+{fmt(x.points)}</span> : null}</span>
                        ) : canEnter && withdraw && x.participation === "individual" ? (
                          <ActionForm action={withdraw} submitLabel="Withdraw" variant="danger" confirm={`Withdraw from ${x.item_name}?`}>
                            <input type="hidden" name="entryId" value={x.entry_id} />
                          </ActionForm>
                        ) : <span className="text-xs text-zinc-400">Results not out yet</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {canEnter ? (
                  <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                    <h3 className="mb-2 text-sm font-semibold text-[var(--heading)]">Items open to you</h3>
                    {open.length === 0 ? <p className="text-sm text-zinc-500">Nothing more to enter right now. Group items are entered by your teachers.</p> : (
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {open.map((i) => (
                          <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-[var(--foreground)]">{i.name}</span>
                              {i.category ? <span className="text-xs text-zinc-500">{i.category}</span> : null}
                            </span>
                            <ActionForm action={enrol!} submitLabel="Enter" variant="secondary">
                              <input type="hidden" name="itemId" value={i.id} />
                            </ActionForm>
                          </li>
                        ))}
                      </ul>
                    )}
                    {e.max_items_per_student ? <p className="mt-2 text-xs text-zinc-500">You can enter up to {e.max_items_per_student} items in this event.</p> : null}
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
        <Panel title="House standings" subtitle="From published results" color={decorColor(1)}>
          {view.standings.length === 0 ? <EmptyNote>No houses yet.</EmptyNote> : <HouseBoard rows={view.standings} />}
          {view.house ? <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500"><HouseDot color={view.house.color} size={8} /> {who} house: {view.house.name}</p> : null}
        </Panel>
      </div>
    </div>
  );
}
