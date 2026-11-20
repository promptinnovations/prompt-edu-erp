import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRequestContext } from "../../../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../../../services/modules/module-service";
import { can } from "../../../../../../services/permissions/permission-service";
import { listClasses } from "../../../../../../modules/academic/service";
import { listStaffUsers } from "../../../../../../services/users/user-management-service";
import {
  getEvent, getItem, listEntries, listItemJudges, listStudentHouses, listHouses, getScoreSheet,
} from "../../../../../../modules/events/service";
import { PageHeader, Panel, EmptyNote } from "../../../../../components/portal/viz/blocks";
import { decorColor } from "../../../../../components/portal/viz/palette";
import ActionForm from "../../../../../components/ui/ActionForm";
import { enrolAction, withdrawEntryAction, setEntryStatusAction, setJudgesAction, saveScoresAction, deleteItemAction } from "../../../actions";
import { inputClass, labelClass } from "../../../../../components/ui/form-classes";
import { StatusBadge, PlaceBadge, HouseDot, fmt } from "../../../parts";
import ItemForm from "../../../ItemForm";

export default async function ItemPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "events");
  const canManage = ctx.isSuperAdmin || can(ctx.permissions, "events.manage");
  const canJudge = can(ctx.permissions, "events.judge");
  if (!canManage && !canJudge && !can(ctx.permissions, "events.view")) redirect("/dashboard");

  const [event, item] = await Promise.all([getEvent(institutionId, authUserId, id), getItem(institutionId, authUserId, itemId)]);
  if (!event || !item || item.event_id !== event.id || (!canManage && event.status === "draft")) notFound();

  const [entries, judges, sheet, classes] = await Promise.all([
    listEntries(institutionId, authUserId, itemId),
    listItemJudges(institutionId, authUserId, itemId),
    getScoreSheet(institutionId, authUserId, ctx.userId, itemId),
    listClasses(institutionId, authUserId),
  ]);
  const [roster, houses, staff] = canManage
    ? await Promise.all([listStudentHouses(institutionId, authUserId), listHouses(institutionId, authUserId), listStaffUsers(institutionId, authUserId)])
    : [[], [], []];

  const className = new Map(classes.map((c) => [c.id, c.name]));
  const houseName = new Map(houses.map((h) => [h.id, h.name]));
  const entered = new Set(entries.filter((e) => e.status !== "withdrawn").flatMap((e) => e.members.map((m) => m.student_id)));
  const eligible = roster.filter((r) =>
    !entered.has(r.student_id) && r.class_id &&
    (!item.eligible_class_ids || item.eligible_class_ids.includes(r.class_id)) &&
    (!item.gender || (r.gender ?? "").toLowerCase() === item.gender));
  const judgeIds = new Set(judges.map((j) => j.user_id));
  const marking = event.status === "enrolment_closed" || event.status === "judging";
  const canMark = marking && (sheet?.is_judge || canManage);
  const showResults = canManage || event.status === "published";
  const locked = event.status === "published";
  const hideNames = !canManage; // judges mark by entry number only

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.name}
        subtitle={`${event.name} · ${item.participation === "group" ? `Group, up to ${item.team_size_max}` : "Individual"} · ${item.eligible_class_ids ? item.eligible_class_ids.map((c) => className.get(c) ?? "?").join(", ") : "All classes"}${item.gender ? ` · ${item.gender === "male" ? "Boys" : "Girls"}` : ""}`}
        icon="🎯" color={decorColor(1)}
      >
        <StatusBadge status={event.status} />
        <Link href={`/events/${event.id}`} className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-primary-50">← {event.name}</Link>
      </PageHeader>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-primary-50 px-3 py-1 text-primary-800">Criteria: {item.criteria.join(", ")} (out of {fmt(item.max_mark_per_criterion)} each)</span>
        <span className="rounded-full bg-accent-50 px-3 py-1 text-accent-800">House points: 1st {fmt(item.points_first)} · 2nd {fmt(item.points_second)} · 3rd {fmt(item.points_third)} · A {fmt(item.points_grade_a)} · B {fmt(item.points_grade_b)} · C {fmt(item.points_grade_c)}</span>
        {item.max_entries_per_house ? <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">Up to {item.max_entries_per_house} per house</span> : null}
      </div>

      {canMark && sheet ? (
        <Panel title="Enter marks" subtitle={sheet.is_judge ? "Your marks as a judge — by entry number" : "You are not a judge for this item; marks are saved under your name"} color={decorColor(2)}>
          <div id="marks" className="scroll-mt-20" />
          {sheet.entries.length === 0 ? <EmptyNote>No entries to mark.</EmptyNote> : (
            <ActionForm action={saveScoresAction} submitLabel="Save marks" className="space-y-3">
              <input type="hidden" name="itemId" value={item.id} />
              {item.criteria.map((c) => <input key={c} type="hidden" name="criteria" value={c} />)}
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[360px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                    <tr><th className="py-1.5 pr-3">Entry</th>{item.criteria.map((c) => <th key={c} className="py-1.5 pr-3">{c} <span className="normal-case tracking-normal text-zinc-400">/ {fmt(item.max_mark_per_criterion)}</span></th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {sheet.entries.map((e) => (
                      <tr key={e.id}>
                        <td className="py-1.5 pr-3 font-semibold text-[var(--foreground)]">No. {e.entry_no}{e.team_name ? <span className="ml-1 text-xs font-normal text-zinc-500">{e.team_name}</span> : null}</td>
                        {item.criteria.map((c, ci) => (
                          <td key={c} className="py-1.5 pr-3">
                            <div className="w-24"><input aria-label={`Entry ${e.entry_no} ${c}`} name={`m:${e.id}:${ci}`} type="number" inputMode="decimal" min={0} max={item.max_mark_per_criterion} step="0.25"
                              defaultValue={e.marks[c] ?? ""} className={inputClass} /></div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ActionForm>
          )}
        </Panel>
      ) : null}

      <Panel title="Entries" subtitle={`${entries.filter((e) => e.status === "enrolled").length} taking part`} color={decorColor(0)}>
        {entries.length === 0 ? <EmptyNote>No entries yet.</EmptyNote> : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  <th className="py-1.5 pr-3">No.</th><th className="py-1.5 pr-3">{item.participation === "group" ? "Team" : "Student"}</th><th className="py-1.5 pr-3">House</th>
                  {showResults ? <><th className="py-1.5 pr-3">Score</th><th className="py-1.5 pr-3">Result</th><th className="py-1.5 pr-3">Points</th></> : null}
                  {canManage && !locked ? <th className="py-1.5" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {entries.map((e) => (
                  <tr key={e.id} className={e.status !== "enrolled" ? "text-zinc-400" : ""}>
                    <td className="py-2 pr-3 font-semibold">{e.entry_no}</td>
                    <td className="py-2 pr-3">
                      {hideNames ? (e.team_name ?? "—") : (
                        <>
                          {e.team_name ? <div className="font-medium">{e.team_name}</div> : null}
                          <div className={e.team_name ? "text-xs text-zinc-500" : "font-medium"}>{e.members.map((m) => `${m.full_name}${m.class_name ? ` (${m.class_name}${m.section_name ? ` ${m.section_name}` : ""})` : ""}`).join(", ")}</div>
                        </>
                      )}
                      {e.status !== "enrolled" ? <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] capitalize text-zinc-600">{e.status}</span> : null}
                    </td>
                    <td className="py-2 pr-3"><span className="inline-flex items-center gap-1.5"><HouseDot color={e.house_color} />{e.house_name ?? "—"}</span></td>
                    {showResults ? (
                      <>
                        <td className="py-2 pr-3">{e.score_pct === null ? "—" : `${fmt(e.score_pct)}%`}</td>
                        <td className="py-2 pr-3"><PlaceBadge position={e.position} grade={e.grade} /></td>
                        <td className="py-2 pr-3 font-semibold">{e.points ? fmt(e.points) : "—"}</td>
                      </>
                    ) : null}
                    {canManage && !locked ? (
                      <td className="py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {e.status !== "withdrawn" ? (
                            <ActionForm action={setEntryStatusAction} submitLabel={e.status === "absent" ? "Present" : "Absent"} variant="secondary">
                              <input type="hidden" name="entryId" value={e.id} />
                              <input type="hidden" name="status" value={e.status === "absent" ? "enrolled" : "absent"} />
                            </ActionForm>
                          ) : null}
                          {e.status !== "withdrawn" ? (
                            <ActionForm action={withdrawEntryAction} submitLabel="Withdraw" variant="danger" confirm="Withdraw this entry?">
                              <input type="hidden" name="entryId" value={e.id} />
                            </ActionForm>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage && !locked ? (
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <h3 className="mb-2 text-sm font-semibold text-[var(--heading)]">Enter {item.participation === "group" ? "a team" : "a student"}</h3>
            {eligible.length === 0 ? <p className="text-sm text-zinc-500">Every eligible student is already entered.</p> : (
              <ActionForm action={enrolAction} submitLabel="Enter" resetOnSuccess className="space-y-3">
                <input type="hidden" name="itemId" value={item.id} />
                {item.participation === "group" ? (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div>
                      <label className={labelClass} htmlFor="enrol-team">Team members (hold Ctrl / ⌘ to pick several — all from one house)</label>
                      <select id="enrol-team" name="studentIds" multiple size={8} className={inputClass}>
                        {houses.map((h) => (
                          <optgroup key={h.id} label={h.name}>
                            {eligible.filter((r) => r.house_id === h.id).map((r) => <option key={r.student_id} value={r.student_id}>{r.full_name} — {r.class_name}{r.section_name ? ` ${r.section_name}` : ""}</option>)}
                          </optgroup>
                        ))}
                        {eligible.some((r) => !r.house_id) ? (
                          <optgroup label="No house">
                            {eligible.filter((r) => !r.house_id).map((r) => <option key={r.student_id} value={r.student_id}>{r.full_name} — {r.class_name}</option>)}
                          </optgroup>
                        ) : null}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="enrol-team-name">Team name (optional)</label>
                      <input id="enrol-team-name" name="teamName" maxLength={80} placeholder="e.g. Team A" className={inputClass} />
                    </div>
                  </div>
                ) : (
                  <div className="max-w-md">
                    <label className={labelClass} htmlFor="enrol-student">Student</label>
                    <select id="enrol-student" name="studentIds" required className={inputClass} defaultValue="">
                      <option value="" disabled>Choose a student…</option>
                      {eligible.map((r) => (
                        <option key={r.student_id} value={r.student_id}>{r.full_name} — {r.class_name}{r.section_name ? ` ${r.section_name}` : ""}{r.house_id ? ` · ${houseName.get(r.house_id)}` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
              </ActionForm>
            )}
          </div>
        ) : null}
      </Panel>

      {canManage ? (
        <Panel title="Judges" subtitle="Staff who mark this item. Each judge sees entry numbers, not names; the score is the average of the judges' totals." color={decorColor(3)}>
          <ActionForm action={setJudgesAction} submitLabel="Save judges" className="space-y-3">
            <input type="hidden" name="itemId" value={item.id} />
            <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
              {staff.map((s) => (
                <label key={s.userId} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs has-[:checked]:border-[var(--brand)] has-[:checked]:bg-primary-50 has-[:checked]:text-primary-800">
                  <input type="checkbox" name="judgeUserIds" value={s.userId} defaultChecked={judgeIds.has(s.userId)} className="accent-[var(--brand)]" />
                  {s.fullName}
                </label>
              ))}
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {canManage && !locked ? (
        <Panel title="Item settings" color={decorColor(4)}>
          <ItemForm eventId={event.id} item={item} classes={classes.map((c) => ({ id: c.id, name: c.name }))} />
          <div className="mt-4 flex justify-end border-t border-[var(--border-subtle)] pt-4">
            <ActionForm action={deleteItemAction} submitLabel="Delete item" variant="danger" confirm={`Delete ${item.name} with its entries and marks?`}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="eventId" value={event.id} />
            </ActionForm>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
