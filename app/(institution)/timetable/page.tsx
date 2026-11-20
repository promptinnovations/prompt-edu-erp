import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStaff } from "../../../modules/staff/service";
import { listTimetable } from "../../../modules/substitution/service";
import { todayIST } from "../../../services/datetime/ist";
import { PageHeader, Panel, EmptyNote } from "../../components/portal/viz/blocks";
import { decorColor } from "../../components/portal/viz/palette";
import TimetableGrid from "../../components/TimetableGrid";
import PrintButton from "../../components/PrintButton";
import { inputClass } from "../../components/ui/form-classes";

/**
 * School timetable ("add a button in the side panel where the timetable of
 * the school will be shown") — read-only week grid for any class-division
 * or any teacher. Opens on the signed-in teacher's own timetable when they
 * have one, otherwise on the first class. Editing stays in Substitution →
 * Timetable.
 */
export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "substitution");
  if (!ctx.isSuperAdmin && !can(ctx.permissions, "substitution.view") && !can(ctx.permissions, "staff.view")) redirect("/dashboard");

  const [periods, staff] = await Promise.all([listTimetable(institutionId, authUserId), listStaff(institutionId, authUserId)]);
  const classes = [...new Map(periods.map((p) => [`${p.classId}:${p.sectionId}`, { key: `c:${p.classId}:${p.sectionId}`, label: `${p.className} ${p.sectionName}` }])).values()];
  const teacherIds = new Set(periods.map((p) => p.teacherStaffId).filter(Boolean));
  const teachers = staff.filter((s) => teacherIds.has(s.id)).map((s) => ({ key: `t:${s.id}`, label: s.full_name }));
  const me = staff.find((s) => s.user_id === ctx.userId && teacherIds.has(s.id));

  const selected = [...classes, ...teachers].some((o) => o.key === show) ? show! : me ? `t:${me.id}` : classes[0]?.key ?? "";
  const [kind, a, b] = selected.split(":");
  const rows = kind === "t" ? periods.filter((p) => p.teacherStaffId === a) : periods.filter((p) => p.classId === a && p.sectionId === b);
  const title = kind === "t" ? (me && me.id === a ? "My timetable" : teachers.find((t) => t.key === selected)?.label ?? "") : classes.find((c) => c.key === selected)?.label ?? "";
  const dow = new Date(`${todayIST()}T00:00:00Z`).getUTCDay();
  const today = dow === 0 ? 7 : dow;
  const canManage = ctx.isSuperAdmin || can(ctx.permissions, "substitution.timetable.manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Timetable" subtitle="The school's weekly timetable — by class or by teacher" icon="🗓️" color={decorColor(0)}>
        {canManage ? <Link href="/substitution/timetable" className="no-print rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-primary-50">Edit timetable</Link> : null}
      </PageHeader>

      {periods.length === 0 ? (
        <Panel title="Timetable"><EmptyNote>No timetable has been set up yet.{canManage ? " Add periods in Substitution → Timetable, or upload it from Import / Export." : ""}</EmptyNote></Panel>
      ) : (
        <Panel
          title={title}
          subtitle={kind === "t" ? `${rows.length} periods a week` : `${new Set(rows.map((r) => r.teacherStaffId).filter(Boolean)).size} teachers`}
          color={decorColor(1)}
          action={
            <div className="no-print flex flex-wrap items-center gap-2">
              <form method="get" className="flex items-center gap-2">
                <label className="sr-only" htmlFor="tt-show">Show the timetable of</label>
                <div className="w-56">
                  <select id="tt-show" name="show" defaultValue={selected} className={inputClass}>
                    {me ? <option value={`t:${me.id}`}>My timetable</option> : null}
                    <optgroup label="Classes">{classes.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup>
                    <optgroup label="Teachers">{teachers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
                  </select>
                </div>
                <button type="submit" className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]">Show</button>
              </form>
              <PrintButton label="Print" />
            </div>
          }
        >
          <TimetableGrid periods={rows} show={kind === "t" ? "class" : "teacher"} today={today} />
        </Panel>
      )}
    </div>
  );
}
