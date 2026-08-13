"use client";

export default function ClassSectionPicker({
  classes,
  sections,
  classId,
  sectionId,
  date,
}: {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; class_id: string; name: string }>;
  classId: string;
  sectionId: string;
  date: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
        <select name="classId" defaultValue={classId} className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="">Select…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Section</label>
        <select name="sectionId" defaultValue={sectionId} className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="">Select…</option>
          {sections.filter((s) => !classId || s.class_id === classId).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Date</label>
        <input type="date" name="date" defaultValue={date} className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <button type="submit" className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
        Load
      </button>
    </form>
  );
}
