import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { listHouses, listStudentHouses } from "../../../../modules/events/service";
import { PageHeader, Panel, EmptyNote } from "../../../components/portal/viz/blocks";
import { decorColor } from "../../../components/portal/viz/palette";
import ActionForm from "../../../components/ui/ActionForm";
import { saveHouseAction, deleteHouseAction, autoAssignHousesAction, assignHousesAction } from "../actions";
import { inputClass, labelClass } from "../../../components/ui/form-classes";
import { HouseDot } from "../parts";

export default async function HousesPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "events");
  if (!ctx.isSuperAdmin && !can(ctx.permissions, "events.manage")) redirect("/events");
  const sp = await searchParams;

  const [houses, roster] = await Promise.all([listHouses(institutionId, authUserId), listStudentHouses(institutionId, authUserId)]);
  const classes = [...new Map(roster.filter((r) => r.class_id).map((r) => [r.class_id!, r.class_name ?? ""])).entries()];
  const selectedClass = sp.class && classes.some(([id]) => id === sp.class) ? sp.class : classes[0]?.[0];
  const rows = roster.filter((r) => r.class_id === selectedClass);
  const unassigned = roster.filter((r) => !r.house_id).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Houses" subtitle="The teams students compete for — one house per student for the academic year" icon="👥" color={decorColor(2)}>
        <Link href="/events" className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-primary-50">← Events</Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Houses" subtitle={`${roster.length - unassigned} of ${roster.length} students placed`} color={decorColor(0)}>
          {houses.length === 0 ? <EmptyNote>No houses yet — add the first one below.</EmptyNote> : (
            <ul className="space-y-2">
              {houses.map((h) => (
                <li key={h.id} className="rounded-xl border border-[var(--border-subtle)] p-3">
                  <ActionForm action={saveHouseAction} submitLabel="Save" variant="secondary" className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="houseId" value={h.id} />
                    <HouseDot color={h.color} size={14} />
                    <div className="min-w-[8rem] flex-1">
                      <label className="sr-only" htmlFor={`hn-${h.id}`}>House name</label>
                      <input id={`hn-${h.id}`} name="name" defaultValue={h.name} required maxLength={60} className={inputClass} />
                    </div>
                    <label className="sr-only" htmlFor={`hc-${h.id}`}>Colour</label>
                    <input id={`hc-${h.id}`} name="color" type="color" defaultValue={h.color} className="h-8 w-10 cursor-pointer rounded border border-[var(--border-subtle)] bg-transparent" />
                    <span className="self-center text-xs text-zinc-500">{h.member_count} students</span>
                  </ActionForm>
                  <div className="mt-2 flex justify-end">
                    <ActionForm action={deleteHouseAction} submitLabel="Remove" variant="danger" confirm={`Remove ${h.name}? Its students will have no house.`}>
                      <input type="hidden" name="houseId" value={h.id} />
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <ActionForm action={saveHouseAction} submitLabel="Add house" resetOnSuccess className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1">
                <label className={labelClass} htmlFor="new-house">New house</label>
                <input id="new-house" name="name" required maxLength={60} placeholder="e.g. Crescent House" className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="new-house-colour">Colour</label>
                <input id="new-house-colour" name="color" type="color" defaultValue="#0f766e" className="h-8 w-12 cursor-pointer rounded border border-[var(--border-subtle)] bg-transparent" />
              </div>
            </ActionForm>
          </div>
        </Panel>

        <Panel title="Place students in houses" subtitle="Automatic placement keeps every class balanced, boys and girls alike" color={decorColor(1)}>
          <p className="mb-3 text-sm text-zinc-600">
            {unassigned === 0 ? "Every student has a house." : `${unassigned} student${unassigned === 1 ? " has" : "s have"} no house yet.`} Automatic placement only fills in students without a house — nobody already placed is moved.
          </p>
          <ActionForm action={autoAssignHousesAction} submitLabel="Place students automatically" pendingLabel="Placing…" />
        </Panel>
      </div>

      <Panel title="Students by class" subtitle="Change a student's house and save" color={decorColor(3)}>
        {classes.length === 0 ? <EmptyNote>No students are enrolled in a class this year.</EmptyNote> : (
          <>
            <nav aria-label="Class" className="mb-4 flex flex-wrap gap-1.5">
              {classes.map(([id, name]) => (
                <Link key={id} href={`/events/houses?class=${id}`} aria-current={id === selectedClass ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${id === selectedClass ? "bg-[var(--brand)] text-white" : "border border-[var(--border-subtle)] text-zinc-700 hover:bg-[var(--surface-muted)]"}`}>
                  {name}
                </Link>
              ))}
            </nav>
            <ActionForm action={assignHousesAction} submitLabel="Save houses" className="space-y-3">
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                    <tr><th className="py-1.5 pr-3">Student</th><th className="py-1.5 pr-3">Division</th><th className="py-1.5 pr-3">Gender</th><th className="py-1.5">House</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {rows.map((r) => (
                      <tr key={r.student_id}>
                        <td className="py-1.5 pr-3 font-medium text-[var(--foreground)]">{r.full_name}<span className="ml-1 text-xs font-normal text-zinc-400">{r.admission_number}</span></td>
                        <td className="py-1.5 pr-3 text-zinc-600">{r.section_name ?? "—"}</td>
                        <td className="py-1.5 pr-3 capitalize text-zinc-600">{r.gender ?? "—"}</td>
                        <td className="py-1.5">
                          <input type="hidden" name={`was:${r.student_id}`} value={r.house_id ?? ""} />
                          <div className="w-48"><select aria-label={`House for ${r.full_name}`} name={`house:${r.student_id}`} defaultValue={r.house_id ?? ""} className={inputClass}>
                            <option value="">— No house —</option>
                            {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                          </select></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ActionForm>
          </>
        )}
      </Panel>
    </div>
  );
}
