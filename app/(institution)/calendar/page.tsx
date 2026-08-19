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
  holiday: "bg-rose-500", exam: "bg-amber-500", meeting: "bg-sky-500", ptm: "bg-violet-500", other: "bg-zinc-400",
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
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Academic Calendar</h1>
        {canManage ? (
          <Link href="/import" className="text-sm text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
            Bulk upload events (Excel) →
          </Link>
        ) : null}
      </div>

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add an event</h2>
          <AddEventForm />
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No upcoming events.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {upcoming.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${EVENT_TYPE_DOT[e.event_type]}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{e.title}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {EVENT_TYPE_LABEL[e.event_type]} · {formatDate(e.start_date)}
                      {e.end_date ? ` – ${formatDate(e.end_date)}` : ""}
                    </p>
                  </div>
                </div>
                {canManage ? <DeleteEventButton eventId={e.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Past</h2>
        {past.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No past events yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {past.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 opacity-70">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${EVENT_TYPE_DOT[e.event_type]}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{e.title}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      {EVENT_TYPE_LABEL[e.event_type]} · {formatDate(e.start_date)}
                      {e.end_date ? ` – ${formatDate(e.end_date)}` : ""}
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
