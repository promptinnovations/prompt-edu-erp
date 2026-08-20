import type { MonthlyAttendancePoint } from "../../../../modules/attendance/service";
import type { StudentSubjectMarkRow } from "../../../../modules/examination/service";

const MONTH_LABEL = (ym: string) => {
  const [, m] = ym.split("-");
  return ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m)] ?? ym;
};

/** §Student Profile feature (Summary tab) — pure CSS bars, no chart library
 *  needed for something this simple, and it stays server-renderable (no
 *  client JS at all). See modules/attendance/service.ts's
 *  getStudentMonthlyAttendance() doc comment for why this is present/absent
 *  only, not a third "leave" series. */
export function MonthlyAttendanceBarChart({ points }: { points: MonthlyAttendancePoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No attendance recorded yet this year.</p>;
  }
  const maxTotal = Math.max(...points.map((p) => p.total), 1);
  return (
    <div>
      <div className="flex items-end gap-3 sm:gap-4" style={{ height: 140 }}>
        {points.map((p) => {
          const presentH = (p.present / maxTotal) * 100;
          const absentH = (p.absent / maxTotal) * 100;
          return (
            <div key={p.month} className="flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
              <div className="flex w-full max-w-[28px] flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: "100%" }}>
                <div style={{ height: `${absentH}%` }} className="w-full bg-red-300 dark:bg-red-900/60" title={`${p.absent} absent`} />
                <div style={{ height: `${presentH}%` }} className="w-full bg-emerald-400 dark:bg-emerald-700" title={`${p.present} present`} />
              </div>
              <div className="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">{MONTH_LABEL(p.month)}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-700" /> Present</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-300 dark:bg-red-900/60" /> Absent</span>
      </div>
    </div>
  );
}

const SLICE_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7", "#ef4444", "#84cc16", "#14b8a6", "#f97316",
];

/** §Student Profile feature (Summary/Academics tabs) — a conic-gradient
 *  donut showing how this student's most recent examination marks split
 *  across subjects; see modules/examination/service.ts's
 *  getStudentExamReport() doc comment for why no such per-student breakdown
 *  existed before this feature. Slice size is each subject's share of
 *  total marks obtained (a subject scored higher takes a bigger slice),
 *  not just an equal split — that's what "marks by subject" means. */
export function ExamSubjectPieChart({ subjects }: { subjects: StudentSubjectMarkRow[] }) {
  const scored = subjects.filter((s) => !s.is_absent && s.marks_obtained !== null);
  const totalObtained = scored.reduce((sum, s) => sum + Number(s.marks_obtained), 0);
  const totalMax = subjects.reduce((sum, s) => sum + Number(s.max_marks), 0);
  const overallPercent = totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : 0;

  if (scored.length === 0) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-500">No approved marks yet for this exam.</p>;
  }

  let cursor = 0;
  const stops = scored.map((s, i) => {
    const share = totalObtained > 0 ? (Number(s.marks_obtained) / totalObtained) * 100 : 100 / scored.length;
    const from = cursor;
    cursor += share;
    return `${SLICE_COLORS[i % SLICE_COLORS.length]} ${from}% ${cursor}%`;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="relative h-32 w-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      >
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white text-center dark:bg-zinc-900">
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{overallPercent}%</div>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500">total</div>
        </div>
      </div>
      <ul className="space-y-1 text-sm">
        {scored.map((s, i) => (
          <li key={s.subject_id} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
            <span className="text-zinc-700 dark:text-zinc-300">{s.subject_name}</span>
            <span className="text-zinc-400 dark:text-zinc-500">{s.marks_obtained}/{s.max_marks}</span>
          </li>
        ))}
        {subjects.filter((s) => s.is_absent).map((s) => (
          <li key={s.subject_id} className="flex items-center gap-2 text-zinc-400 dark:text-zinc-500">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-zinc-300 dark:bg-zinc-700" />
            <span>{s.subject_name}</span>
            <span>Absent</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
