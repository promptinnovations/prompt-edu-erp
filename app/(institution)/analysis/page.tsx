import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getEnabledModuleCodes } from "../../../services/modules/module-service";
import { listDisciplineRecords } from "../../../modules/discipline/service";
import { listSkillSubmissions } from "../../../modules/skills/service";
import { listAchievements } from "../../../modules/achievements/service";
import { listMentoringRecords, getOwnStaffId } from "../../../modules/mentoring/service";
import { getInstitutionAttendanceTrend } from "../../../modules/attendance/service";

/** Unified "Analysis" hub — the top-level group is deliberately distinct
 *  from "Result > Analysis" (that one is exam-specific, i.e. /analytics
 *  filtered to one examination's pattern recognition); THIS page is the
 *  cross-module picture: exam patterns + discipline + skills +
 *  achievements + mentoring, one summary card each with a link into that
 *  module's own detail view. Kept deliberately light — the real pattern-
 *  recognition engine already lives in modules/analytics/service.ts
 *  (Phase 5); this page doesn't duplicate it, just surfaces simple counts
 *  for the modules that don't have their own analytics page yet. */
export default async function AnalysisPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const enabledModules = await getEnabledModuleCodes(institutionId, authUserId);

  const hasAttendanceAnalytics = enabledModules.has("attendance") && (can(ctx.permissions, "attendance.view") || can(ctx.permissions, "attendance.edit"));

  const [discipline, skills, achievements, ownMentorStaffId, attendanceTrend] = await Promise.all([
    enabledModules.has("discipline") && can(ctx.permissions, "discipline.view") ? listDisciplineRecords(institutionId, authUserId) : Promise.resolve([]),
    enabledModules.has("skills") ? listSkillSubmissions(institutionId, authUserId) : Promise.resolve([]),
    enabledModules.has("achievements") ? listAchievements(institutionId, authUserId) : Promise.resolve([]),
    enabledModules.has("mentoring") ? getOwnStaffId(institutionId, authUserId, ctx.userId) : Promise.resolve(null),
    // §Page-4 follow-up "Attendance analytics...plus analytics" — a one-line
    // summary card here, full detail chart stays on the Attendance page.
    hasAttendanceAnalytics ? getInstitutionAttendanceTrend(institutionId, authUserId, 14) : Promise.resolve([]),
  ]);
  const canViewAllMentoring = can(ctx.permissions, "mentoring.view_all");
  const mentoring = enabledModules.has("mentoring")
    ? await listMentoringRecords(institutionId, authUserId, { canViewAll: canViewAllMentoring, ownMentorStaffId })
    : [];

  const disciplinePositive = discipline.filter((d) => d.is_positive).length;
  const disciplineNegative = discipline.length - disciplinePositive;
  const skillsByStatus = groupCount(skills, (s) => s.status);
  const achievementsByStatus = groupCount(achievements, (a) => a.status);
  const mentoringWithActionPlan = mentoring.filter((m) => m.action_plan || m.goals).length;

  const attendanceTrendBody = (() => {
    if (attendanceTrend.length === 0) return "No attendance has been taken yet.";
    const first = attendanceTrend[0].presentPercent;
    const last = attendanceTrend[attendanceTrend.length - 1].presentPercent;
    const delta = Math.round((last - first) * 100) / 100;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return `${last}% present most recently, ${direction}${delta !== 0 ? ` ${Math.abs(delta)} pts` : ""} over the last ${attendanceTrend.length} day${attendanceTrend.length === 1 ? "" : "s"}.`;
  })();

  const cards = [
    {
      title: "Examination pattern analysis",
      href: "/analytics",
      visible: can(ctx.permissions, "reports.view"),
      body: "Grade distributions, subject-wise performance trends, and at-risk classification — the full analytics engine.",
    },
    {
      title: "Attendance trends",
      href: "/attendance",
      visible: hasAttendanceAnalytics,
      body: attendanceTrendBody,
    },
    {
      title: "Discipline trends",
      href: "/discipline",
      visible: enabledModules.has("discipline") && can(ctx.permissions, "discipline.view"),
      body: `${discipline.length} record${discipline.length === 1 ? "" : "s"} — ${disciplinePositive} positive, ${disciplineNegative} negative.`,
    },
    {
      title: "Skills trends",
      href: "/skills",
      visible: enabledModules.has("skills"),
      body: Object.entries(skillsByStatus).map(([k, v]) => `${v} ${k}`).join(", ") || "No submissions yet.",
    },
    {
      title: "Achievements trends",
      href: "/achievements",
      visible: enabledModules.has("achievements"),
      body: Object.entries(achievementsByStatus).map(([k, v]) => `${v} ${k}`).join(", ") || "No achievements yet.",
    },
    {
      title: "Mentoring patterns",
      href: "/mentoring",
      visible: enabledModules.has("mentoring") && (canViewAllMentoring || !!ownMentorStaffId),
      body: `${mentoring.length} mentoring record${mentoring.length === 1 ? "" : "s"} — ${mentoringWithActionPlan} with goals/an action plan set.`,
    },
  ].filter((c) => c.visible);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Analysis</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Exam, discipline, skills, and achievements pattern analysis in one place.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 transition-colors hover:border-[var(--brand)]"
          >
            <h2 className="mb-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{c.title}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{c.body}</p>
          </Link>
        ))}
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Nothing to analyze yet for your role/modules.</p>
        ) : null}
      </div>
    </div>
  );
}

function groupCount<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
