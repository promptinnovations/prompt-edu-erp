"use client";

export default function AttendanceTrendPicker({
  classes,
  sections,
  classId,
  sectionId,
  fromMonth,
  toMonth,
  examinationId,
}: {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; class_id: string; name: string }>;
  classId: string;
  sectionId: string;
  fromMonth: string;
  toMonth: string;
  examinationId: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="examinationId" value={examinationId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
        <select name="trendClassId" defaultValue={classId} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="">Select…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Section</label>
        <select name="trendSectionId" defaultValue={sectionId} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="">Select…</option>
          {sections.filter((s) => !classId || s.class_id === classId).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">From month</label>
        <input type="month" name="fromMonth" defaultValue={fromMonth} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">To month</label>
        <input type="month" name="toMonth" defaultValue={toMonth} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
        Load trend
      </button>
    </form>
  );
}
