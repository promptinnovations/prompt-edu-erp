import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getEnabledModuleCodes } from "../../../services/modules/module-service";
import { listExaminations } from "../../../modules/examination/service";
import { PrintIcon, ResultIcon, AttendanceIcon, StaffIcon, ExamIcon } from "../../components/NavIcons";

/** "Print Center — Print all types of docs and reports" — a single
 *  directory of every printable/downloadable thing in the app: the new
 *  per-examination printables (Report Cards, Consolidated Marks, Monthly
 *  Registers) plus the pre-existing generic Reports engine (/reports,
 *  PDF/XLSX) — one destination instead of hunting through each module. */
export default async function PrintCenterPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const enabledModules = await getEnabledModuleCodes(institutionId, authUserId);

  const examinations = enabledModules.has("examination") ? await listExaminations(institutionId, authUserId) : [];
  const latestExam = examinations[0];

  const tiles = [
    {
      icon: ResultIcon,
      title: "Report Cards",
      body: "Per-student printable report cards for any examination.",
      href: latestExam ? `/results/${latestExam.id}/report-cards` : "/results",
      visible: enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.approve")),
    },
    {
      icon: ExamIcon,
      title: "Consolidated Marks",
      body: "Student x subject marks matrix for one examination.",
      href: latestExam ? `/results/${latestExam.id}/consolidated` : "/results",
      visible: enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.approve")),
    },
    {
      icon: AttendanceIcon,
      title: "Monthly Attendance Register",
      body: "A class/section's whole-month attendance grid.",
      href: "/attendance/register",
      visible: enabledModules.has("attendance") && (can(ctx.permissions, "attendance.view") || can(ctx.permissions, "attendance.enter")),
    },
    {
      icon: StaffIcon,
      title: "Staff Monthly Register",
      body: "Every active staff member's whole-month attendance grid.",
      href: "/staff/register",
      visible: enabledModules.has("staff") && can(ctx.permissions, "staff.view"),
    },
    {
      icon: PrintIcon,
      title: "General Reports (PDF / XLSX)",
      body: "Student roster, examination results, attendance summary, consolidated performance, library circulation.",
      href: "/reports",
      visible: can(ctx.permissions, "reports.view"),
    },
  ].filter((t) => t.visible);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Print Center</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Print or download any document/report from one place.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.title}
              href={t.href}
              className="flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 transition-colors hover:border-[var(--brand)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-teal)]/10 text-[var(--accent-teal)]">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t.title}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.body}</p>
            </Link>
          );
        })}
        {tiles.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">Nothing printable is available for your role yet.</p>
        ) : null}
      </div>
    </div>
  );
}
