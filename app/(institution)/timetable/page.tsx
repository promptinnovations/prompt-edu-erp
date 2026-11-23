import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import {
  listTimetable, listSubstitutions, getMyStaffId, listTeacherClasses,
  type SubstitutionRow, type TimetablePeriodRow,
} from "../../../modules/substitution/service";
import { todayIST, formatTimeIST, formatDateIST } from "../../../services/datetime/ist";
import { PageHeader, Panel, EmptyNote } from "../../components/portal/viz/blocks";
import { decorColor, tint, STATUS_COLOR } from "../../components/portal/viz/palette";
import TimetableGrid, { type GridOverlayCell } from "../../components/TimetableGrid";
import PrintButton from "../../components/PrintButton";
import { inputClass } from "../../components/ui/form-classes";
import AckSubstitutionButton from "./AckSubstitutionButton";
import PhoneAlerts from "./PhoneAlerts";
import MySubstitutions from "../../components/staff/MySubstitutions";
import { getVapidKeys } from "../../../services/notification/web-push";
import TimetablePicker, { type PickerOption } from "./TimetablePicker";
import TimetableNavigator, { type NavItem } from "./TimetableNavigator";

/**
 * Timetable.
 *  - A teacher (no "timetable.view_all") sees their OWN timetable and the
 *    classes they have access to — nothing else. Today's substitutions are
 *    laid over their week in a highlight colour; tapping one signs that they
 *    have taken it.
 *  - Principal, section heads and other authorised people ("timetable.view_all")
 *    can search any class or teacher, and see a "Substitutions" panel that
 *    shows, for a day, which substitutions are confirmed and which are not.
 * Editing the timetable stays in Substitution → Timetable.
 */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color, backgroundColor: tint(color, 0.14) }}>{children}</span>;
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ show?: string; date?: string }> }) {
  const { show, date } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "substitution");
  const viewAll = ctx.isSuperAdmin || can(ctx.permissions, "timetable.view_all") || can(ctx.permissions, "substitution.manage");
  if (!viewAll && !can(ctx.permissions, "substitution.view") && !can(ctx.permissions, "staff.view")) redirect("/dashboard");

  const today = todayIST();
  const jsDay = new Date(`${today}T00:00:00Z`).getUTCDay();
  const todayDow = jsDay === 0 ? 7 : jsDay;
  const canManage = ctx.isSuperAdmin || can(ctx.permissions, "substitution.timetable.manage");
  const myStaffId = await getMyStaffId(institutionId, authUserId, ctx.userId);

  if (!viewAll && !myStaffId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Timetable" subtitle="Your timetable" icon="🗓️" color={decorColor(0)} />
        <Panel title="Timetable"><EmptyNote>Your login is not linked to a staff record yet, so there is no timetable to show. Please ask the school office.</EmptyNote></Panel>
      </div>
    );
  }

  // ---- What the signed-in person's substitutions are (today and the coming week) ----
  const [mySubs, myAbsentToday] = myStaffId
    ? await Promise.all([
        listSubstitutions(institutionId, authUserId, { from: today, to: addDays(today, 7), coveringStaffId: myStaffId }),
        listSubstitutions(institutionId, authUserId, { from: today, to: today, absentStaffId: myStaffId }),
      ])
    : [[], []];

  // ---- Which timetable is on screen, and who may pick what ----
  let options: PickerOption[] = [];
  let rows: TimetablePeriodRow[] = [];
  let selected = "";
  let titleName = "";
  let kind: "t" | "c" = "t";
  let a = "", b = "";
  let teacherNames = new Map<string, string>();
  let navClasses: NavItem[] = [], navTeachers: NavItem[] = [];

  if (viewAll) {
    const all = await listTimetable(institutionId, authUserId);
    const classes = [...new Map(all.map((p) => [`c:${p.classId}:${p.sectionId}`, `${p.className} ${p.sectionName}`])).entries()].map(([key, label]) => ({ key, label: `${label} — class` }));
    teacherNames = new Map(all.filter((p) => p.teacherStaffId && p.teacherName).map((p) => [p.teacherStaffId!, p.teacherName!]));
    const hasMine = !!myStaffId && teacherNames.has(myStaffId);
    options = [
      ...(hasMine ? [{ key: `t:${myStaffId}`, label: "My timetable" }] : []),
      ...classes,
      ...[...teacherNames.entries()].filter(([id]) => id !== myStaffId).sort((x, y) => x[1].localeCompare(y[1])).map(([id, name]) => ({ key: `t:${id}`, label: `${name} — teacher` })),
    ];
    // Classes keep the school's own order (sort order, then division); teachers A-Z.
    navClasses = classes.map((c) => ({ key: c.key, label: c.label.replace(" — class", "") }));
    navTeachers = [...teacherNames.entries()].filter(([id]) => id !== myStaffId).sort((x, y) => x[1].localeCompare(y[1])).map(([id, name]) => ({ key: `t:${id}`, label: name }));
    selected = options.some((o) => o.key === show) ? show! : hasMine ? `t:${myStaffId}` : options[0]?.key ?? "";
    [kind, a, b] = selected.split(":") as ["t" | "c", string, string];
    rows = kind === "t" ? all.filter((p) => p.teacherStaffId === a) : all.filter((p) => p.classId === a && p.sectionId === b);
    titleName = kind === "t" ? (a === myStaffId ? "My timetable" : teacherNames.get(a) ?? "") : classes.find((c) => c.key === selected)?.label.replace(" — class", "") ?? "";
  } else {
    const myClasses = await listTeacherClasses(institutionId, authUserId, ctx.userId, myStaffId);
    options = [
      { key: `t:${myStaffId}`, label: "My timetable" },
      ...myClasses.map((c) => ({ key: `c:${c.classId}:${c.sectionId}`, label: `${c.label} — class` })),
    ];
    selected = options.some((o) => o.key === show) ? show! : `t:${myStaffId}`;
    [kind, a, b] = selected.split(":") as ["t" | "c", string, string];
    rows = kind === "t"
      ? await listTimetable(institutionId, authUserId, { teacherStaffId: myStaffId! })
      : await listTimetable(institutionId, authUserId, { classId: a, sectionId: b });
    titleName = kind === "t" ? "My timetable" : myClasses.find((c) => `c:${c.classId}:${c.sectionId}` === selected)?.label ?? "";
  }

  // ---- Authority: substitutions of the chosen day ----
  const panelDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const panelSubs: SubstitutionRow[] = viewAll ? await listSubstitutions(institutionId, authUserId, { from: panelDate, to: panelDate }) : [];
  const todaySubs: SubstitutionRow[] = viewAll
    ? (panelDate === today ? panelSubs : await listSubstitutions(institutionId, authUserId, { from: today, to: today }))
    : [...mySubs.filter((s) => s.date === today), ...myAbsentToday];

  // ---- Today's substitutions laid over the teacher's week ----
  const overlay: Record<string, GridOverlayCell> = {};
  if (kind === "t") {
    const canAck = a === myStaffId;
    for (const s of todaySubs) {
      const key = `${todayDow}:${s.periodNo}`;
      if (s.coveringStaffId === a) {
        const body = (
          <div className="px-2 py-1.5 text-left text-[var(--foreground)]">
            <div className="truncate text-xs font-semibold" title={`${s.className} ${s.sectionName}`}>{s.className} {s.sectionName} · Substitution</div>
            <div className="truncate text-[11px]">{s.subjectName ?? "—"} · for {s.absentStaffName}</div>
            <div className="text-[11px] font-semibold">{s.acknowledgedAt ? `✓ Confirmed ${formatTimeIST(s.acknowledgedAt)}` : canAck ? "Tap to confirm" : "Not confirmed yet"}</div>
          </div>
        );
        overlay[key] = {
          kind: "cover", acknowledged: !!s.acknowledgedAt,
          content: !s.acknowledgedAt && canAck
            ? <AckSubstitutionButton substitutionId={s.id} className="block w-full cursor-pointer rounded-lg text-left hover:brightness-95" title="Tap to confirm that you will take this period">{body}</AckSubstitutionButton>
            : body,
        };
      } else if (s.absentStaffId === a && !overlay[key]) {
        overlay[key] = {
          kind: "covered",
          content: (
            <>
              <div className="truncate text-xs font-semibold text-zinc-500 line-through">{s.className} {s.sectionName}</div>
              <div className="truncate text-[11px] text-zinc-600">{s.coveringStaffName ? `Covered by ${s.coveringStaffName}` : "No cover assigned yet"}</div>
            </>
          ),
        };
      }
    }
  }

  const stats = {
    total: panelSubs.length,
    done: panelSubs.filter((s) => s.acknowledgedAt).length,
    open: panelSubs.filter((s) => s.coveringStaffId && !s.acknowledgedAt).length,
    none: panelSubs.filter((s) => !s.coveringStaffId).length,
  };
  const rank = (s: SubstitutionRow) => (!s.coveringStaffId ? 0 : !s.acknowledgedAt ? 1 : 2);
  const panelSorted = [...panelSubs].sort((x, y) => rank(x) - rank(y) || x.periodNo - y.periodNo);
  const teacherIdByName = new Map([...teacherNames.entries()].map(([id, name]) => [name, id]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable"
        subtitle={viewAll ? "Every class and teacher — search to open one" : "Your timetable and the classes you teach"}
        icon="🗓️" color={decorColor(0)}
      >
        {canManage ? <Link href="/substitution/timetable" className="no-print rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-primary-50">Edit timetable</Link> : null}
      </PageHeader>

      {mySubs.length > 0 ? <MySubstitutions subs={mySubs} today={today} action={<PhoneAlerts publicKey={getVapidKeys()?.publicKey ?? null} />} /> : null}

      {viewAll ? (
        <Panel
          title={`Substitutions · ${panelDate === today ? "today" : formatDateIST(panelDate)}`}
          subtitle={panelSubs.length === 0 ? "No substitutions on this day" : `${stats.done} of ${stats.total} confirmed${stats.open ? ` · ${stats.open} waiting` : ""}${stats.none ? ` · ${stats.none} without a teacher` : ""}`}
          color={stats.open || stats.none ? STATUS_COLOR.late : STATUS_COLOR.present}
          action={
            <form method="get" className="no-print flex items-center gap-2">
              <input type="hidden" name="show" value={selected} />
              <label className="sr-only" htmlFor="tt-date">Date</label>
              <input id="tt-date" type="date" name="date" defaultValue={panelDate} className={`${inputClass} w-40`} />
              <button type="submit" className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]">Show</button>
            </form>
          }
        >
          {panelSubs.length === 0 ? (
            <EmptyNote>Nothing to verify for this day.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                    <th className="py-1.5 pr-3">Period</th><th className="py-1.5 pr-3">Class</th><th className="py-1.5 pr-3">Subject</th>
                    <th className="py-1.5 pr-3">Absent</th><th className="py-1.5 pr-3">Covering</th><th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {panelSorted.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--border-subtle)]">
                      <td className="py-2 pr-3 font-semibold">P{s.periodNo}</td>
                      <td className="py-2 pr-3">{s.className} {s.sectionName}</td>
                      <td className="py-2 pr-3">{s.subjectName ?? "—"}</td>
                      <td className="py-2 pr-3">{s.absentStaffName}</td>
                      <td className="py-2 pr-3">
                        {s.coveringStaffName
                          ? (teacherIdByName.get(s.coveringStaffName) ? <Link className="text-[var(--brand)] underline" href={`/timetable?show=${encodeURIComponent(`t:${teacherIdByName.get(s.coveringStaffName)}`)}`}>{s.coveringStaffName}</Link> : s.coveringStaffName)
                          : "—"}
                      </td>
                      <td className="py-2">
                        {!s.coveringStaffId ? <Badge color={STATUS_COLOR.absent}>No teacher assigned</Badge>
                          : s.acknowledgedAt ? <Badge color={STATUS_COLOR.present}>Confirmed {formatTimeIST(s.acknowledgedAt)}</Badge>
                          : <Badge color={STATUS_COLOR.late}>Not confirmed</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {viewAll && options.length > 0 ? (
        <TimetableNavigator classes={navClasses} teachers={navTeachers} mineKey={myStaffId && teacherNames.has(myStaffId) ? `t:${myStaffId}` : null} selectedKey={selected} />
      ) : null}

      {options.length === 0 ? (
        <Panel title="Timetable"><EmptyNote>No timetable has been set up yet.{canManage ? " Add periods in Substitution → Timetable, or upload it from Import / Export." : ""}</EmptyNote></Panel>
      ) : (
        <Panel
          title={titleName}
          subtitle={kind === "t" ? `${rows.length} periods a week` : `${new Set(rows.map((r) => r.teacherStaffId).filter(Boolean)).size} teachers`}
          color={decorColor(1)}
          action={
            <div className="no-print flex flex-wrap items-center gap-2">
              {viewAll ? null : <TimetablePicker options={options} selectedKey={selected} />}
              <PrintButton label="Print" />
            </div>
          }
        >
          <TimetableGrid periods={rows} show={kind === "t" ? "class" : "teacher"} today={todayDow} overlay={overlay} />
        </Panel>
      )}
    </div>
  );
}
