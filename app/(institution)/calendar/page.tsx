import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listCalendarEvents } from "../../../modules/calendar/service";
import AddEventForm from "./AddEventForm";
import DeleteEventButton from "./DeleteEventButton";

const EVENT_TYPE_LABEL: Record<string, string> = {
  holiday: "Holiday", exam: "Exam", meeting: "Meeting", ptm: "PTM", other: "Other",
};
const EVENT_TYPE_DOT: Record<string, string> = {
  holiday: "bg-rose-500", exam: "bg-amber-500", meeting: "bg-sky-500", ptm: "bg-accent-500", other: "bg-zinc-400",
};
const EVENT_TYPE_BORDER: Record<string, string> = {
  holiday: "border-l-rose-500", exam: "border-l-amber-500", meeting: "border-l-sky-500", ptm: "border-l-accent-500", other: "border-l-zinc-400",
};
const EVENT_TYPE_BADGE: Record<string, string> = {
  holiday: "bg-rose-100 text-rose-700",
  exam: "bg-amber-100 text-amber-700",
  meeting: "bg-sky-100 text-sky-700",
  ptm: "bg-accent-100 text-accent-800",
  other: "bg-zinc-100 text-zinc-600",
};

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default async function CalendarPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "calendar");
  if (!can(ctx.permissions, "calendar.view")) redirect("/dashboard");

  const canManage = can(ctx.permissions, "calendar.manage");
  const today = new Date().toISOString().slice(0, 10);
  const allEvents = await listCalendarEvents(institutionId, authUserId);
  const upcoming = allEvents.filter((e) => (e.end_date ?? e.start_date) >= today);
  const past = allEvents.filter((e) => (e.end_date ?? e.start_date) < today).reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Academic Calendar</h1>
        {canManage ? (
          <Link href="/import" className="text-sm text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
            Bulk upload events (Excel) →
          </Link>
        ) : null}
      </div>

      {canManage ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Add an event</h2>
          <AddEventForm />
        </section>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-500">No upcoming events.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <li key={e.id} className={`flex items-center justify-between gap-3 rounded-lg border-l-4 bg-zinc-50 py-2.5 pl-3 pr-3 ${EVENT_TYPE_BORDER[e.event_type]}`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${EVENT_TYPE_DOT[e.event_type]}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{e.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${EVENT_TYPE_BADGE[e.event_type]}`}>
                        {EVENT_TYPE_LABEL[e.event_type]}
                      </span>
                      <span>{formatDate(e.start_date)}{e.end_date ? ` – ${formatDate(e.end_date)}` : ""}</span>
                      {e.club_in_charge ? <span>· {e.club_in_charge}</span> : null}
                    </p>
                  </div>
                </div>
                {canManage ? <DeleteEventButton eventId={e.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Past</h2>
        {past.length === 0 ? (
          <p className="text-sm text-zinc-500">No past events yet.</p>
        ) : (
          <ul className="space-y-2 opacity-70">
            {past.map((e) => (
              <li key={e.id} className={`flex items-center justify-between gap-3 rounded-lg border-l-4 bg-zinc-50 py-2.5 pl-3 pr-3 ${EVENT_TYPE_BORDER[e.event_type]}`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${EVENT_TYPE_DOT[e.event_type]}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{e.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${EVENT_TYPE_BADGE[e.event_type]}`}>
                        {EVENT_TYPE_LABEL[e.event_type]}
                      </span>
                      <span>{formatDate(e.start_date)}{e.end_date ? ` – ${formatDate(e.end_date)}` : ""}</span>
                      {e.club_in_charge ? <span>· {e.club_in_charge}</span> : null}
                    </p>
                  </div>
                </div>
                {canManage ? <DeleteEventButton eventId={e.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
