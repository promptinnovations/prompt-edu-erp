import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardInsights } from "../../../../modules/portal/student-insights";
import { formatDateIST } from "../../../../services/datetime/ist";
import { Panel, StatTile, EmptyNote } from "../viz/blocks";
import { Sparkline, Timeline } from "../viz/charts";
import { NEUTRAL, seriesColor, tint } from "../viz/palette";
import { AREA } from "../student/areas";
import LatestDailyResults from "../student/LatestDailyResults";

export const FEES_COLOR = seriesColor(6);
export const CONTACT_COLOR = seriesColor(5);

export interface ParentDashboardShow {
  results: boolean; attendance: boolean; achievements: boolean; library: boolean;
  fees: boolean; leave: boolean; messages: boolean; kudos: boolean;
}
export interface ParentFeeSummary { pendingCount: number; balance: number; overdueCount: number; nextDue: string | null }

export interface ParentHrefs {
  academics: string; attendance: string; achievements: string; reading: string; fees: string; contact: string; growth: string;
}

function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** §Parent-portal-visual-redesign — the parent's landing page for the
 *  selected child: one headline per area (each opening its page), what
 *  needs the parent's attention, quick actions, what's coming up and the
 *  child's details. Each area's charts live only on that area's page. */
export default function ParentDashboardView({
  childName, childFirstName, admissionNumber, insights, photo, switcher, banner, details,
  show, fees, leavesPending, schoolNotes, hrefs, dailyMonthHref,
}: {
  childName: string; childFirstName: string; admissionNumber: string | null;
  insights: DashboardInsights; photo: ReactNode; switcher?: ReactNode; banner?: ReactNode; details?: ReactNode;
  show: ParentDashboardShow; fees: ParentFeeSummary | null; leavesPending: number; schoolNotes: number; hrefs: ParentHrefs;
  /** §Dashboard-latest-daily — the month page for a Daily Assessment register. */
  dailyMonthHref: (examinationId: string) => string;
}) {
  const d = insights;
  const latest = d.recentExams[d.recentExams.length - 1] ?? null;

  const attention = [
    show.fees && fees && fees.balance > 0
      ? { key: "fees", icon: "💳", href: hrefs.fees, urgent: fees.overdueCount > 0,
          text: <><b>{rupees(fees.balance)}</b> fees pending{fees.overdueCount > 0 ? ` · ${fees.overdueCount} overdue` : fees.nextDue ? ` · next due ${formatDateIST(fees.nextDue)}` : ""}</> }
      : null,
    show.leave && leavesPending > 0
      ? { key: "leave", icon: "📝", href: `${hrefs.attendance}#leave`, urgent: false, text: <><b>{leavesPending}</b> leave request{leavesPending === 1 ? "" : "s"} awaiting the school&rsquo;s reply</> }
      : null,
    schoolNotes > 0
      ? { key: "notes", icon: "📌", href: hrefs.growth, urgent: false, text: <><b>{schoolNotes}</b> note{schoolNotes === 1 ? "" : "s"} from school in the last 30 days</> }
      : null,
    show.library && d.todo.overdue > 0
      ? { key: "overdue", icon: "⏰", href: hrefs.reading, urgent: true, text: <><b>{d.todo.overdue}</b> library book{d.todo.overdue === 1 ? "" : "s"} overdue</> }
      : null,
    show.library && d.todo.readyToCollect > 0
      ? { key: "collect", icon: "📦", href: hrefs.reading, urgent: false, text: <><b>{d.todo.readyToCollect}</b> reserved book{d.todo.readyToCollect === 1 ? "" : "s"} ready for {childFirstName} to collect</> }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const actions = [
    show.leave ? { label: "Apply for leave", icon: "📝", href: `${hrefs.attendance}#leave`, color: AREA.attendance.color } : null,
    show.fees ? { label: "Pay fees", icon: "💳", href: hrefs.fees, color: FEES_COLOR } : null,
    show.messages ? { label: "Message a teacher", icon: "✉️", href: hrefs.contact, color: CONTACT_COLOR } : null,
    show.kudos ? { label: "Send kudos", icon: "🌸", href: `${hrefs.contact}#kudos`, color: AREA.growth.color } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const tiles: ReactNode[] = [];
  if (show.results) tiles.push(
    <StatTile
      key="r" label="Latest result" icon={AREA.academics.icon} color={AREA.academics.color} href={hrefs.academics}
      value={latest ? (
        <span className="inline-flex items-center gap-2">
          {latest.percent}%
          {latest.grade_label ? <span className="rounded-md px-1.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: latest.grade_color || NEUTRAL }}>{latest.grade_label}</span> : null}
        </span>
      ) : "—"}
      sub={latest ? latest.name : "No published results yet"}
    >
      {d.recentExams.length > 1 ? <Sparkline values={d.recentExams.map((e) => e.percent)} labels={d.recentExams.map((e) => e.name)} color={AREA.academics.color} width={220} height={44} /> : null}
    </StatTile>,
  );
  if (show.attendance) tiles.push(
    <StatTile
      key="a" label="Attendance" icon={AREA.attendance.icon} color={AREA.attendance.color} href={hrefs.attendance}
      value={d.attendance.percent != null ? `${d.attendance.percent}%` : "—"}
      sub={d.attendance.total > 0 ? `Present ${d.attendance.present} of ${d.attendance.total} days` : "Not marked yet this year"}
    >
      {d.attendance.percent != null ? (
          <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ backgroundColor: tint(AREA.attendance.color, 0.15) }} aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, d.attendance.percent ?? 0))}%`, backgroundColor: AREA.attendance.color }} />
          </div>
      ) : null}
    </StatTile>,
  );
  if (show.achievements) tiles.push(
    <StatTile
      key="h" label="Achievements" icon={AREA.achievements.icon} color={AREA.achievements.color} href={hrefs.achievements}
      value={d.achievements.total} sub={d.achievements.total > 0 ? `${d.achievements.podium} on the podium` : "Awards will appear here"}
    >
      {d.achievements.total > 0 ? (
        <div className="flex gap-1 text-lg" aria-hidden>
          {Array.from({ length: Math.min(8, d.achievements.total) }, (_, i) => <span key={i}>{i < d.achievements.podium ? "🥇" : "🏅"}</span>)}
        </div>
      ) : null}
    </StatTile>,
  );
  if (show.fees && fees) tiles.push(
    <StatTile
      key="f" label="Fees balance" icon="💳" color={FEES_COLOR} href={hrefs.fees}
      value={fees.balance > 0 ? rupees(fees.balance) : "All paid"}
      sub={fees.balance > 0 ? `${fees.pendingCount} invoice${fees.pendingCount === 1 ? "" : "s"} pending` : "Nothing due right now"}
    />,
  );
  else if (show.library) tiles.push(
    <StatTile key="b" label="Books read" icon={AREA.reading.icon} color={AREA.reading.color} href={hrefs.reading} value={d.booksRead} sub="Borrowed and returned" />,
  );

  return (
    <div className="space-y-6">
      {banner}

      <section
        className="relative overflow-hidden rounded-card p-5 text-white shadow-raised sm:p-7"
        style={{ background: "linear-gradient(120deg, var(--brand-from, #1d4ed8), var(--brand-via, #4f46e5) 55%, var(--brand-to, #7c3aed))" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center gap-4 sm:gap-5">
          <div className="rounded-full bg-white/20 p-1">{photo}</div>
          <div className="min-w-[12rem] flex-1">
            <p className="text-sm text-white/80">Parent portal</p>
            <h1 className="text-2xl font-semibold sm:text-3xl">{childFirstName}&rsquo;s overview</h1>
            <p className="mt-1 text-sm text-white/85">
              {[childName, d.classLabel ? `Class ${d.classLabel}` : null, d.rollNumber != null ? `Roll ${d.rollNumber}` : null, admissionNumber ? `Adm. ${admissionNumber}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          {switcher}
        </div>
      </section>

      {tiles.length > 0 ? (
        <section aria-label="At a glance" className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${tiles.length >= 4 ? "xl:grid-cols-4" : tiles.length === 3 ? "xl:grid-cols-3" : ""}`}>
          {tiles}
        </section>
      ) : null}

      {show.results ? <LatestDailyResults days={d.latestDaily} monthHref={dailyMonthHref} /> : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Needs your attention" color={seriesColor(7)} className="lg:col-span-3">
          {attention.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span aria-hidden className="text-4xl">✅</span>
              <p className="text-sm text-zinc-600">Nothing needs your attention right now.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:bg-[var(--surface-muted)]"
                    style={{ borderColor: a.urgent ? tint("#e34948", 0.45) : "var(--border-subtle)", backgroundColor: a.urgent ? tint("#e34948", 0.05) : undefined }}
                  >
                    <span aria-hidden className="text-lg">{a.icon}</span>
                    <span className="flex-1 text-zinc-700">{a.text}</span>
                    <span aria-hidden className="text-zinc-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Quick actions" color={CONTACT_COLOR} className="lg:col-span-2">
          {actions.length === 0 ? (
            <EmptyNote>No actions are enabled for parents at this school.</EmptyNote>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {actions.map((a) => (
                <li key={a.label}>
                  <Link
                    href={a.href}
                    className="flex h-full flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-sm font-medium text-[var(--foreground)] transition-all hover:-translate-y-0.5 hover:shadow-raised"
                    style={{ borderColor: tint(a.color, 0.35), backgroundColor: tint(a.color, 0.08) }}
                  >
                    <span aria-hidden className="text-2xl">{a.icon}</span>
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Coming up" subtitle={`Exams for ${childFirstName}'s class and school events.`} color={seriesColor(6)}>
        {d.upcoming.length === 0 ? (
          <EmptyNote>Nothing scheduled yet.</EmptyNote>
        ) : (
          <Timeline
            items={d.upcoming.map((u) => ({
              key: `${u.kind}-${u.id}`,
              date: `${formatDateIST(u.start)}${u.end && u.end !== u.start ? ` – ${formatDateIST(u.end)}` : ""}`,
              title: u.title,
              meta: u.kind === "exam" ? "Examination" : ({ holiday: "Holiday", meeting: "Meeting", ptm: "Parent–teacher meeting", exam: "Exam", other: "Event" } as Record<string, string>)[u.type] ?? "Event",
              color: u.kind === "exam" ? AREA.academics.color : u.type === "holiday" ? "#c7bda9" : u.type === "ptm" ? AREA.growth.color : seriesColor(6),
              icon: u.kind === "exam" ? "✎" : u.type === "holiday" ? "☀" : "★",
            }))}
          />
        )}
      </Panel>

      {details}
    </div>
  );
}
