import Link from "next/link";
import { getStudent360 } from "../../../../modules/portfolio/service";
import { listKudosForStudent } from "../../../../modules/communication/service";
import { listApprovedReviews } from "../../../../modules/library/service";
import { listClasses, listSections } from "../../../../modules/academic/service";
import { requireOwnStudentId, NotLinkedNotice, Card } from "./_lib";

/** Dashboard — the student portal's landing page (§ student-portal redesign:
 *  "what should be seen primarily is the portfolio, dashboard, exam
 *  performance, library reading, reviews posted"). At-a-glance stats plus a
 *  short recent-activity peek; the full detail for each area lives on its
 *  own sub-route, reachable from the sidebar.
 *
 *  §Follow-up "all reviews should not be seen in student portal front
 *  page — only review posted by the concerned child": this page only ever
 *  shows THIS student's own posted reviews (filtered client-side below,
 *  same as listApprovedReviews' viewerStudentId param elsewhere is only
 *  used for reaction state, not filtering) — browsing everyone else's
 *  reviews now lives on the Library & reading page instead. */
export default async function StudentDashboardPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [summary, kudosReceived, approvedReviews, classes] = await Promise.all([
    getStudent360(institutionId, authUserId, ownStudentId, 5),
    listKudosForStudent(institutionId, authUserId, ownStudentId),
    listApprovedReviews(institutionId, authUserId, null, ownStudentId),
    listClasses(institutionId, authUserId),
  ]);
  const myReviews = approvedReviews.filter((r) => r.student_id === ownStudentId);

  const classById = new Map(classes.map((c) => [c.id, c.name]));
  let classDivisionLabel = "Not enrolled";
  if (summary.enrollment) {
    const sections = await listSections(institutionId, authUserId, summary.enrollment.class_id);
    const currentSection = sections.find((s) => s.id === summary.enrollment?.section_id);
    classDivisionLabel = `${classById.get(summary.enrollment.class_id) ?? "?"}${currentSection ? ` · Div. ${currentSection.name}` : ""}`;
  }

  const stats = [
    { label: "Attendance (this year)", value: summary.attendanceSummary ? `${summary.attendanceSummary.present_percent}%` : "—" },
    {
      label: summary.latestResult ? `Latest: ${summary.latestResult.examination_name}` : "No results yet",
      value: summary.latestResult ? `${summary.latestResult.percentage}%` : "—",
    },
    { label: "Consolidated score", value: summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—" },
    { label: "Recent portfolio events", value: String(summary.recentPortfolioEvents.length) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-sm">
        {summary.student?.photo_file_id ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route
          <img
            src={`/api/files/${summary.student.photo_file_id}`}
            alt=""
            className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--surface-muted)]"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xl font-medium text-zinc-500 ring-2 ring-[var(--surface-muted)]">
            {(summary.student?.full_name ?? "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">{summary.student?.full_name ?? "My profile"}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {summary.student?.admission_number} · {classDivisionLabel}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="text-2xl font-semibold text-[var(--foreground)]">{s.value}</div>
            <div className="mt-1 text-sm text-zinc-500">{s.label}</div>
          </div>
        ))}
      </div>

      <Card title="Recent portfolio timeline" subtitle="Your latest 5 entries — see everything on the Portfolio page.">
        <ul className="space-y-2 text-sm">
          {summary.recentPortfolioEvents.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0">
              <span className="text-[var(--foreground)]">{e.title}</span>
              <span className="text-zinc-400">{e.event_date}</span>
            </li>
          ))}
          {summary.recentPortfolioEvents.length === 0 ? <li className="text-zinc-400">Nothing yet.</li> : null}
        </ul>
        <Link href="/portal/student/portfolio" className="mt-3 inline-block text-xs font-medium text-[var(--brand)] hover:underline">
          View full portfolio →
        </Link>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/portal/student/exams"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-sm transition-colors hover:border-[var(--brand)]"
        >
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Exam performance</h2>
          <p className="mt-1 text-xs text-zinc-500">Results, attendance and consolidated score in detail.</p>
        </Link>
        <Link
          href="/portal/student/library"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-sm transition-colors hover:border-[var(--brand)]"
        >
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Library &amp; reading</h2>
          <p className="mt-1 text-xs text-zinc-500">Catalogue, pre-booking, and all book reviews.</p>
        </Link>
      </div>

      <Card title="Reviews you've posted" subtitle="See everyone else's reviews on the Library & reading page.">
        <ul className="space-y-2 text-sm">
          {myReviews.map((r) => (
            <li key={r.id} className="border-b border-[var(--border-subtle)] pb-2 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--foreground)]">{r.book_title}</span>
                <span className="text-zinc-400">👍 {r.like_count}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{r.review_text}</p>
            </li>
          ))}
          {myReviews.length === 0 ? <li className="text-zinc-400">You haven&apos;t posted a review yet.</li> : null}
        </ul>
      </Card>

      {kudosReceived.length > 0 ? (
        <Card title="Kudos received 🌸">
          <ul className="space-y-2 text-sm">
            {kudosReceived.map((k) => (
              <li key={k.id} className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0">
                <span className="text-[var(--foreground)]">
                  {k.kind === "flower" ? "🌸" : "🎉"} {k.message || (k.kind === "flower" ? "Sent a flower" : "Congratulations!")} — from {k.parent_name}
                </span>
                <span className="text-zinc-400">{k.created_at}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
