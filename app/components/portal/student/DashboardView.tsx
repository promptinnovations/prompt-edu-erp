import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardInsights } from "../../../../modules/portal/student-insights";
import { formatDateIST } from "../../../../services/datetime/ist";
import { Panel, StatTile, EmptyNote } from "../viz/blocks";
import { Sparkline, Timeline } from "../viz/charts";
import { NEUTRAL, seriesColor, tint } from "../viz/palette";
import { AREA } from "./areas";
import LatestDailyResults from "./LatestDailyResults";

/** §Student-portal-visual-redesign — Dashboard = "at a glance" + "take
 *  action". It shows each area's single headline number (with a small
 *  visual) and links to that area's own page for the detail; it does NOT
 *  repeat any of those pages' charts or lists. What only lives here:
 *  what's coming up, the to-do list, kudos, and personal details. */
export default function DashboardView({
  firstName, fullName, admissionNumber, insights, photo, banner, details,
}: {
  firstName: string; fullName: string; admissionNumber: string | null;
  insights: DashboardInsights; photo: ReactNode; banner?: ReactNode; details?: ReactNode;
}) {
  const d = insights;
  const latest = d.recentExams[d.recentExams.length - 1] ?? null;

  const todo = [
    { n: d.todo.readyToCollect, text: "book ready to collect", plural: "books ready to collect", href: AREA.reading.href, icon: "📦" },
    { n: d.todo.overdue, text: "library book overdue", plural: "library books overdue", href: AREA.reading.href, icon: "⏰" },
    { n: d.todo.reviewsToWrite, text: "book review to write", plural: "book reviews to write", href: AREA.reading.href, icon: "✍️" },
    { n: d.todo.awaitingApproval, text: "submission awaiting teacher approval", plural: "submissions awaiting teacher approval", href: AREA.achievements.href, icon: "⏳" },
  ].filter((t) => t.n > 0);

  return (
    <div className="space-y-6">
      {banner}

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-card p-5 text-white shadow-raised sm:p-7"
        style={{ background: "linear-gradient(120deg, var(--brand-from, #1d4ed8), var(--brand-via, #4f46e5) 55%, var(--brand-to, #7c3aed))" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center gap-4 sm:gap-5">
          <div className="rounded-full bg-white/20 p-1">{photo}</div>
          <div className="min-w-[12rem] flex-1">
            <p className="text-sm text-white/80">Welcome back</p>
            <h1 className="text-2xl font-semibold sm:text-3xl">Hi, {firstName} 👋</h1>
            <p className="mt-1 text-sm text-white/85">
              {[fullName, d.classLabel ? `Class ${d.classLabel}` : null, d.rollNumber != null ? `Roll ${d.rollNumber}` : null, admissionNumber ? `Adm. ${admissionNumber}` : null]
                .filter(Boolean).join(" · ")}
            </p>
          </div>
          {d.yearName ? <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">Academic year {d.yearName}</span> : null}
        </div>
      </section>

      {/* At a glance — one headline per area, each opening its own page */}
      <section aria-label="At a glance" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Latest result" icon={AREA.academics.icon} color={AREA.academics.color} href={AREA.academics.href}
          value={latest ? (
            <span className="inline-flex items-center gap-2">
              {latest.percent}%
              {latest.grade_label ? (
                <span className="rounded-md px-1.5 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: latest.grade_color || NEUTRAL }}>{latest.grade_label}</span>
              ) : null}
            </span>
          ) : "—"}
          sub={latest ? latest.name : "No published results yet"}
        >
          {d.recentExams.length > 1 ? (
            <Sparkline values={d.recentExams.map((e) => e.percent)} labels={d.recentExams.map((e) => e.name)} color={AREA.academics.color} width={220} height={44} />
          ) : null}
        </StatTile>

        <StatTile
          label="Attendance" icon={AREA.attendance.icon} color={AREA.attendance.color} href={AREA.attendance.href}
          value={d.attendance.percent != null ? `${d.attendance.percent}%` : "—"}
          sub={d.attendance.total > 0 ? `Present ${d.attendance.present} of ${d.attendance.total} days` : "Not marked yet this year"}
        >
          {/* A slim bar, not a ring: the ring sat over the "Present x of y
              days" line on narrow tiles. */}
          {d.attendance.percent != null ? (
          <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ backgroundColor: tint(AREA.attendance.color, 0.15) }} aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, d.attendance.percent ?? 0))}%`, backgroundColor: AREA.attendance.color }} />
          </div>
          ) : null}
        </StatTile>

        <StatTile
          label="Achievements" icon={AREA.achievements.icon} color={AREA.achievements.color} href={AREA.achievements.href}
          value={d.achievements.total}
          sub={d.achievements.total > 0 ? `${d.achievements.podium} on the podium` : "Your awards will appear here"}
        >
          {d.achievements.total > 0 ? (
            <div className="flex gap-1 text-lg" aria-hidden>
              {Array.from({ length: Math.min(8, d.achievements.total) }, (_, i) => <span key={i}>{i < d.achievements.podium ? "🥇" : "🏅"}</span>)}
            </div>
          ) : null}
        </StatTile>

        <StatTile
          label="Books read" icon={AREA.reading.icon} color={AREA.reading.color} href={AREA.reading.href}
          value={d.booksRead}
          sub={d.booksRead > 0 ? "Different books borrowed and returned" : "Pick your first book from the library"}
        >
          {d.booksRead > 0 ? (
            <div className="flex items-end gap-0.5" aria-hidden title={`${d.booksRead} books read`}>
              {Array.from({ length: Math.min(14, d.booksRead) }, (_, i) => (
                <span key={i} className="inline-block w-2.5 rounded-sm" style={{ height: 18 + ((i * 7) % 12), backgroundColor: seriesColor(i % 4 === 3 ? 0 : 3), opacity: 0.55 + ((i * 13) % 45) / 100 }} />
              ))}
              {d.booksRead > 14 ? <span className="ml-1 text-xs text-zinc-500">+{d.booksRead - 14}</span> : null}
            </div>
          ) : null}
        </StatTile>
      </section>

      <LatestDailyResults days={d.latestDaily} monthHref={(id) => `/portal/student/exams/daily/${id}`} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Coming up" subtitle="Exams and school events in the next weeks." color={seriesColor(6)} className="lg:col-span-3">
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

        <Panel title="To do" subtitle="Things waiting for you." color={seriesColor(7)} className="lg:col-span-2">
          {todo.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span className="text-4xl" aria-hidden>🎉</span>
              <p className="text-sm text-zinc-600">All caught up — nothing pending.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {todo.map((t) => (
                <li key={t.text}>
                  <Link href={t.href} className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--surface-muted)]">
                    <span aria-hidden className="text-lg">{t.icon}</span>
                    <span className="flex-1 text-zinc-700"><b className="text-[var(--foreground)]">{t.n}</b> {t.n === 1 ? t.text : t.plural}</span>
                    <span aria-hidden className="text-zinc-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {d.kudos.length > 0 ? (
        <Panel title="Kudos for you" subtitle="Encouragement sent by your family." color={AREA.growth.color}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.kudos.map((k) => (
              <li key={k.id} className="rounded-xl p-4" style={{ backgroundColor: tint(AREA.growth.color, 0.1) }}>
                <div className="text-2xl" aria-hidden>{k.kind === "flower" ? "🌸" : "🎉"}</div>
                <p className="mt-1 text-sm text-[var(--foreground)]">{k.message || (k.kind === "flower" ? "Sent you a flower" : "Congratulations!")}</p>
                <p className="mt-2 text-xs text-zinc-500">— {k.from} · {formatDateIST(k.date)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {details}
    </div>
  );
}
