"use client";

/**
 * PROMPT EDU ERP — Student Portfolio Dashboard.
 *
 * §Portfolio-dashboard follow-up ("the student and parent portal should be
 * like this [reference: header + stat cards + tab row + Academic
 * Performance / Attendance / Behaviour / Co-curricular / Achievements /
 * Teacher's Remark] — do everything needed for that"). Per the explicit
 * AskUserQuestion answers this is ONE component, reused by:
 *   - the staff Student Portfolio tab (app/(institution)/students/[id]/page.tsx)
 *   - the student portal (app/(portals)/portal/student/portfolio/page.tsx)
 *   - the parent portal, per selected child (app/(portals)/portal/parent/portfolio/page.tsx)
 * No decorative building-photo/verse banner (explicitly skipped for now).
 *
 * This component is purely presentational — it takes a fully-resolved
 * `PortfolioDashboardData` (built by modules/portfolio/dashboard-service.ts,
 * either directly from already-fetched records on the staff page, or via
 * its `loadPortfolioDashboardData()` loader on the portals) and knows
 * nothing about institutionId/authUserId/permissions. `data.sections`
 * (a ParentPortalSections) drives which tabs/sub-sections render — for
 * staff/student callers that's `ALL_PORTFOLIO_SECTIONS`; for the parent
 * portal it's whatever that institution has configured.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Donut, StatCard } from "../charts/ResultCharts";
import { seriesColor } from "../charts/series";
import { formatDateIST } from "../../../services/datetime/ist";
import type { PortfolioDashboardData } from "../../../modules/portfolio/dashboard-service";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return formatDateIST(d);
  } catch {
    return d;
  }
}

function Avatar({ photoFileId, fullName, size = 72 }: { photoFileId: string | null; fullName: string; size?: number }) {
  if (photoFileId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- /api/files/* is an internal streaming route, not a static asset next/image can optimize.
      <img
        src={`/api/files/${photoFileId}`}
        alt={fullName}
        width={size}
        height={size}
        className="rounded-full border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div
      className="flex items-center justify-center rounded-full border bg-[var(--brand)]/10 text-lg font-semibold text-[var(--brand)]"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}

type TabId = "overview" | "academic" | "attendance" | "assessments" | "achievements" | "co-curricular" | "behaviour" | "remarks" | "documents";

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">{title}</h2>
      {subtitle ? <p className="mb-3 text-xs text-zinc-500">{subtitle}</p> : null}
      {children}
    </section>
  );
}

function AcademicPerformanceTable({ data }: { data: PortfolioDashboardData["academicPerformance"] }) {
  if (data.rows.length === 0) {
    return <p className="text-sm text-zinc-500">No exam marks recorded yet for this academic year.</p>;
  }
  const columns = [...data.columns, { key: "final", label: "Final Grade" }];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
          <tr>
            <th className="py-1.5 pr-4">Subject</th>
            {columns.map((c) => (
              <th key={c.key} className="py-1.5 pr-4">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.rows.map((row) => (
            <tr key={row.subjectId}>
              <td className="py-1.5 pr-4 text-zinc-900">{row.subjectName}</td>
              {columns.map((c) => {
                const cell = row.cells[c.key];
                return (
                  <td key={c.key} className="py-1.5 pr-4 text-zinc-600">
                    {cell ? `${Math.round(cell.percent * 10) / 10}%${cell.gradeLabel ? ` (${cell.gradeLabel})` : ""}` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceDonut({ attendance, size = 160 }: { attendance: PortfolioDashboardData["attendance"]; size?: number }) {
  const segments = [
    { label: "Present", value: attendance.present, color: seriesColor(0) },
    { label: "Absent", value: attendance.absent, color: seriesColor(1) },
    { label: "Late", value: attendance.late, color: seriesColor(2) },
  ];
  return (
    <Donut
      segments={segments}
      size={size}
      centerLabel={`${attendance.percent}%`}
      centerSubLabel={`${attendance.totalDays} day${attendance.totalDays === 1 ? "" : "s"}`}
    />
  );
}

function BehaviourBars({ items }: { items: PortfolioDashboardData["behaviour"] }) {
  if (items.length === 0) return <p className="text-sm text-zinc-500">No behaviour/character assessments recorded yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <li key={b.id}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-zinc-900">{b.attributeName}</span>
            <span className="text-xs font-medium text-zinc-500">{b.ratingLabel} &middot; {b.rating}/5</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full bg-[var(--brand)]"
              style={{ width: `${Math.max(0, Math.min(100, (b.rating / 5) * 100))}%` }}
            />
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {b.period}{b.notes ? ` — ${b.notes}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CoCurricularList({ items }: { items: PortfolioDashboardData["coCurricular"] }) {
  if (items.length === 0) return <p className="text-sm text-zinc-500">No approved co-curricular activity yet.</p>;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((s) => (
        <li key={s.id} className="rounded-card border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-900">{s.activityName}</span>
            {s.typeName ? (
              <span className="rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--brand)]">{s.typeName}</span>
            ) : null}
          </div>
          {s.submittedAt ? <div className="mt-0.5 text-xs text-zinc-500">{fmtDate(s.submittedAt)}</div> : null}
        </li>
      ))}
    </ul>
  );
}

function AchievementsList({ items }: { items: PortfolioDashboardData["achievements"] }) {
  if (items.length === 0) return <p className="text-sm text-zinc-500">No approved achievements yet.</p>;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((a) => (
        <li key={a.id} className="flex items-center justify-between rounded-card border p-3 text-sm">
          <div>
            <div className="text-zinc-900">{a.title}</div>
            <div className="text-xs text-zinc-500">
              {a.categoryName} &middot; {a.levelName}{a.position ? ` · ${a.position}` : ""}
            </div>
          </div>
          {a.points ? <span className="text-xs font-medium text-zinc-500">{a.points} pts</span> : null}
        </li>
      ))}
    </ul>
  );
}

function TeacherRemarkBlock({ data, editor }: { data: PortfolioDashboardData; editor?: ReactNode }) {
  const summary = data.portfolioSummary;
  return (
    <div className="space-y-4">
      {summary?.overall_remark ? (
        <blockquote className="rounded-card border-l-4 border-[var(--brand)] bg-[var(--brand)]/5 p-4 text-sm italic text-zinc-700">
          &ldquo;{summary.overall_remark}&rdquo;
        </blockquote>
      ) : (
        <p className="text-sm text-zinc-500">No overall remark recorded yet for this academic year.</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ChecklistCard title="Strengths" items={summary?.strengths ?? []} />
        <ChecklistCard title="Areas for Improvement" items={summary?.areas_for_improvement ?? []} />
        <ChecklistCard title="Future Goals" items={summary?.future_goals ?? []} />
      </div>
      {editor}
    </div>
  );
}

function ChecklistCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-card border p-3">
      <h3 className="mb-2 section-label">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">Nothing recorded yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-zinc-700">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-0.5 text-emerald-600">&#10003;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TAB_ORDER: { id: TabId; label: string; gate?: (s: PortfolioDashboardData["sections"]) => boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "academic", label: "Academic", gate: (s) => s.results },
  { id: "attendance", label: "Attendance", gate: (s) => s.attendance },
  { id: "assessments", label: "Assessments", gate: (s) => s.results },
  { id: "achievements", label: "Achievements", gate: (s) => s.achievements },
  { id: "co-curricular", label: "Co-curricular", gate: (s) => s.skills },
  { id: "behaviour", label: "Behaviour", gate: (s) => s.character || s.discipline },
  { id: "remarks", label: "Teacher Remarks", gate: (s) => s.portfolio },
  { id: "documents", label: "Documents", gate: (s) => s.achievements },
];

export default function StudentPortfolioDashboard({
  data, remarkEditor, academicYearSwitcher, headerActions,
}: {
  data: PortfolioDashboardData;
  /** Staff-only "edit teacher's remark" form, gated by the caller behind
   *  `student.edit` — this component has no notion of permissions itself. */
  remarkEditor?: ReactNode;
  /** Caller-supplied Academic Year <select> — switching years is a server
   *  round-trip (same pattern as the parent portal's ChildPicker), not
   *  client state this component owns. */
  academicYearSwitcher?: ReactNode;
  /** Caller-supplied Print/Download buttons slot (left out by default —
   *  see PrintButtons below for the simple built-in version). */
  headerActions?: ReactNode;
}) {
  const tabs = TAB_ORDER.filter((t) => !t.gate || t.gate(data.sections));
  const [active, setActive] = useState<TabId>("overview");
  const activeTab = tabs.some((t) => t.id === active) ? active : (tabs[0]?.id ?? "overview");

  const { student, stats } = data;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="rounded-card border bg-white p-5 print:border-black">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar photoFileId={student.photoFileId} fullName={student.fullName} />
            <div>
              <h1 className="text-lg font-semibold text-[var(--heading)]">{student.fullName}</h1>
              <p className="text-sm text-zinc-500">
                {student.classLabel ?? "Not enrolled"}{student.rollNumber !== null ? ` · Roll No. ${student.rollNumber}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">Admission No. {student.admissionNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {academicYearSwitcher}
            {headerActions ?? <PrintButtons />}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-4">
          <HeaderFact label="Date of birth" value={student.dateOfBirth ? `${fmtDate(student.dateOfBirth)}${student.age !== null ? ` (${student.age} yrs)` : ""}` : "—"} />
          <HeaderFact label="Blood group" value={student.bloodGroup ?? "—"} />
          <HeaderFact label="Phone" value={student.phone ?? "—"} />
          <HeaderFact label="Academic year" value={data.academicYear?.name ?? "—"} />
        </dl>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Overall Grade" value={stats.overallGradeLabel ?? "—"} />
        <StatCard label="Overall %" value={stats.overallPercentage !== null ? `${stats.overallPercentage}%` : "—"} />
        <StatCard label="Attendance" value={`${stats.attendancePercent}%`} />
        <StatCard label="Achievements" value={String(stats.achievementsCount)} />
        <StatCard label="Co-curricular" value={String(stats.coCurricularCount)} />
        <StatCard label="Behaviour" value={stats.behaviourRatingLabel ?? "—"} />
      </div>

      {/* Tab row */}
      <div className="flex gap-1 overflow-x-auto border-b pb-0 print:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === t.id
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" ? (
        <div className="space-y-6">
          <Section title="Academic performance" subtitle="Term-by-term grades for the selected academic year.">
            <AcademicPerformanceTable data={data.academicPerformance} />
          </Section>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Section title="Attendance">
              <AttendanceDonut attendance={data.attendance} />
            </Section>
            {data.sections.character || data.sections.discipline ? (
              <Section title="Behaviour & conduct">
                <BehaviourBars items={data.behaviour} />
              </Section>
            ) : null}
          </div>
          {data.sections.skills ? (
            <Section title="Co-curricular activities">
              <CoCurricularList items={data.coCurricular} />
            </Section>
          ) : null}
          {data.sections.achievements ? (
            <Section title="Achievements & awards">
              <AchievementsList items={data.achievements} />
            </Section>
          ) : null}
          {data.sections.portfolio ? (
            <Section title="Teacher's overall remark">
              <TeacherRemarkBlock data={data} editor={remarkEditor} />
            </Section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "academic" ? (
        <Section title="Academic performance" subtitle="Every term's percentage and grade, plus a Final column averaging the terms available so far.">
          <AcademicPerformanceTable data={data.academicPerformance} />
        </Section>
      ) : null}

      {activeTab === "attendance" ? (
        <Section title="Attendance" subtitle="Present / absent / late days for the current academic year.">
          <div className="flex flex-wrap items-center gap-8">
            <AttendanceDonut attendance={data.attendance} size={200} />
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <HeaderFact label="Present days" value={String(data.attendance.present)} />
              <HeaderFact label="Absent days" value={String(data.attendance.absent)} />
              <HeaderFact label="Late days" value={String(data.attendance.late)} />
              <HeaderFact label="Total days" value={String(data.attendance.totalDays)} />
            </dl>
          </div>
        </Section>
      ) : null}

      {activeTab === "assessments" ? (
        <Section title="Assessments" subtitle="Subject-wise marks consolidated into term and final grades.">
          <AcademicPerformanceTable data={data.academicPerformance} />
        </Section>
      ) : null}

      {activeTab === "achievements" ? (
        <Section title="Achievements & awards">
          <AchievementsList items={data.achievements} />
        </Section>
      ) : null}

      {activeTab === "co-curricular" ? (
        <Section title="Co-curricular activities" subtitle="Approved skill and activity submissions, grouped by this institution's own configured activity types.">
          <CoCurricularList items={data.coCurricular} />
        </Section>
      ) : null}

      {activeTab === "behaviour" ? (
        <div className="space-y-6">
          {data.sections.character ? (
            <Section title="Character assessments">
              <BehaviourBars items={data.behaviour} />
            </Section>
          ) : null}
          {data.sections.discipline && data.discipline ? (
            <Section title="Discipline records">
              {data.discipline.length === 0 ? (
                <p className="text-sm text-zinc-500">No discipline records.</p>
              ) : (
                <ul className="space-y-2">
                  {data.discipline.map((d) => (
                    <li key={d.id} className="rounded-card border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${d.is_positive ? "text-emerald-700" : "text-red-700"}`}>{d.category_name}</span>
                        <span className="text-xs text-zinc-500">{d.date}</span>
                      </div>
                      {d.severity ? <div className="mt-0.5 text-xs text-zinc-500">Severity: {d.severity}</div> : null}
                      {d.description ? <div className="mt-1 text-xs text-zinc-600">{d.description}</div> : null}
                      {d.action_taken ? <div className="mt-1 text-xs text-zinc-500">Action: {d.action_taken}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "remarks" ? (
        <Section title="Teacher's overall remark" subtitle="A standing summary set by the class teacher — separate from day-to-day mentoring notes.">
          <TeacherRemarkBlock data={data} editor={remarkEditor} />
        </Section>
      ) : null}

      {activeTab === "documents" ? (
        <Section title="Certificates & documents" subtitle="Achievements with an uploaded certificate document.">
          {data.achievements.filter((a) => a.certificateFileId).length === 0 ? (
            <p className="text-sm text-zinc-500">No certificates uploaded yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.achievements.filter((a) => a.certificateFileId).map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-card border p-3 text-sm">
                  <div>
                    <div className="text-zinc-900">{a.title}</div>
                    <div className="text-xs text-zinc-500">{a.categoryName}</div>
                  </div>
                  <a href={`/api/files/${a.certificateFileId}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--brand)] underline">
                    View certificate
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  );
}

function HeaderFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

/** Built-in default for `headerActions` — a plain browser print, which
 *  also covers "Download PDF" via the browser's own print-to-PDF (no
 *  separate server-rendered PDF pipeline for this first cut, matching the
 *  pragmatic scope agreed for this feature). */
function PrintButtons() {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Print
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
      >
        Download PDF
      </button>
    </div>
  );
}
