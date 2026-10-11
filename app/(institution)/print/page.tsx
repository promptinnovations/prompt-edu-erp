import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getEnabledModuleCodes } from "../../../services/modules/module-service";
import { listExaminations } from "../../../modules/examination/service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { sortClasses } from "../../../services/academic/roster-order";
import { getTeacherClassScope, scopeIncludesSection } from "../../../services/scope/teacher-scope-service";
import { can as canDo } from "../../../services/permissions/permission-service";
import { PrintIcon, ResultIcon, AttendanceIcon, StaffIcon, ExamIcon } from "../../components/NavIcons";

/** "Print Center — Print all types of docs and reports" — a single
 *  directory of every printable/downloadable thing in the app: the new
 *  per-examination printables (Report Cards, Consolidated Marks, Monthly
 *  Registers) plus the pre-existing generic Reports engine (/reports,
 *  PDF/XLSX) — one destination instead of hunting through each module. */
export default async function PrintCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ examinationId?: string }>;
}) {
  const { examinationId: requestedExamId = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const enabledModules = await getEnabledModuleCodes(institutionId, authUserId);

  const examinations = enabledModules.has("examination") ? await listExaminations(institutionId, authUserId) : [];
  const latestExam = examinations[0];

  // §Print-center-class-grid ("refer this print center should be like this,
  // if clicked, it will open all report cards of that class") — a
  // stage-grouped grid of every class/division with Consolidated and Report
  // Cards links per division, for one chosen examination. The links go
  // straight to the existing per-exam pages narrowed by classId, and Report
  // Cards goes to the whole-class print route, so clicking one opens every
  // card in that class ready to print.
  const canSeeResults = enabledModules.has("examination")
    && (canDo(ctx.permissions, "marks.view") || canDo(ctx.permissions, "marks.approve"));
  const hasBroadResultAccess = ctx.isSuperAdmin || canDo(ctx.permissions, "marks.approve") || canDo(ctx.permissions, "settings.manage");
  const teacherScope = canSeeResults && !hasBroadResultAccess
    ? await getTeacherClassScope(institutionId, authUserId, ctx.userId)
    : null;

  const gridExam = examinations.find((e) => e.id === requestedExamId) ?? latestExam ?? null;
  const [allClasses, allSections] = canSeeResults
    ? await Promise.all([listClasses(institutionId, authUserId), listSections(institutionId, authUserId)])
    : [[], []];
  const gridClasses = sortClasses(teacherScope ? allClasses.filter((c) => teacherScope.classIds.has(c.id)) : allClasses);
  const gridSections = teacherScope
    ? allSections.filter((s) => scopeIncludesSection(teacherScope, s.class_id, s.id))
    : allSections;

  // Group by the class's own stage (KG / LP / UP / HS / ...), in the house
  // stage order sortClasses() already applies; classes with no stage set
  // fall into one trailing "Other" bucket rather than vanishing.
  const stageGroups: Array<{ stage: string; classes: typeof gridClasses }> = [];
  for (const c of gridClasses) {
    const stage = (c.stage ?? "").trim() || "Other";
    const existing = stageGroups.find((g) => g.stage === stage);
    if (existing) existing.classes.push(c);
    else stageGroups.push({ stage, classes: [c] });
  }

  const tiles = [
    {
      icon: ResultIcon,
      title: "Report Cards",
      body: "Pick an examination, then print any student's report card.",
      href: "/results",
      visible: enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.approve")),
    },
    {
      icon: ExamIcon,
      title: "Consolidated Marks",
      body: "Pick an examination, then view its student x subject marks matrix.",
      href: "/results",
      visible: enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.approve")),
    },
    {
      icon: ExamIcon,
      title: "Cumulative Mark Sheet",
      body: "Every examination in an academic year, side by side, with an average and overall pass/fail per student.",
      href: "/results/cumulative",
      visible: enabledModules.has("examination") && (can(ctx.permissions, "marks.view") || can(ctx.permissions, "marks.approve")),
    },
    {
      icon: ExamIcon,
      title: "Exam Seating & Bench Stickers",
      body: "Room-wise seating chart and printable bench stickers (name, class + division, roll number) for an examination.",
      href: latestExam ? `/examinations/seating?examinationId=${latestExam.id}` : "/examinations/seating",
      visible: enabledModules.has("examination") && can(ctx.permissions, "examinations.seating.manage"),
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
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Print Center</h1>
      <p className="text-sm text-zinc-500">Print or download any document/report from one place.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.title}
              href={t.href}
              className="flex flex-col gap-2 rounded-card border bg-white p-5 transition-colors hover:border-[var(--brand)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-teal)]/10 text-[var(--accent-teal)]">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="text-sm font-semibold text-[var(--heading)]">{t.title}</h2>
              <p className="text-sm text-zinc-500">{t.body}</p>
            </Link>
          );
        })}
        {tiles.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing printable is available for your role yet.</p>
        ) : null}
      </div>

      {canSeeResults && gridExam && gridClasses.length > 0 ? (
        <section className="space-y-4 rounded-card border bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--heading)]">Class-wise printing</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Pick an examination, then a division — <strong>Report Cards</strong> opens every student&rsquo;s card in that
              division ready to print, <strong>Consolidated</strong> opens its marks matrix.
            </p>
          </div>

          {examinations.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {examinations.map((e) => (
                <Link
                  key={e.id}
                  href={`/print?examinationId=${e.id}`}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    gridExam.id === e.id ? "bg-[var(--brand)] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {e.name}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="space-y-5">
            {stageGroups.map((group) => (
              <div key={group.stage}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">{group.stage}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.classes.flatMap((c) => {
                    const divisions = gridSections.filter((s) => s.class_id === c.id);
                    // A class with no divisions still gets one tile, scoped
                    // to the class as a whole.
                    const entries = divisions.length > 0
                      ? divisions.map((d) => ({ key: d.id, label: `${c.name} ${d.name}`, classId: c.id, sectionId: d.id }))
                      : [{ key: c.id, label: c.name, classId: c.id, sectionId: "" }];
                    return entries.map((entry) => {
                      const q = new URLSearchParams({ classId: entry.classId });
                      if (entry.sectionId) q.set("sectionId", entry.sectionId);
                      return (
                        <div key={entry.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2">
                          <span className="text-sm font-semibold text-zinc-900">{entry.label}</span>
                          <Link
                            href={`/results/${gridExam.id}/consolidated?classId=${entry.classId}`}
                            className="text-xs text-zinc-600 underline underline-offset-2 hover:text-[var(--brand)]"
                          >
                            Consolidated
                          </Link>
                          <span className="text-xs text-zinc-300" aria-hidden="true">·</span>
                          <Link
                            href={`/results/${gridExam.id}/report-cards/print-all?${q.toString()}`}
                            className="text-xs text-zinc-600 underline underline-offset-2 hover:text-[var(--brand)]"
                          >
                            Report Cards
                          </Link>
                        </div>
                      );
                    });
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
