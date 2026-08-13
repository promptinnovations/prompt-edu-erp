"use client";

export default function ExaminationPicker({
  examinations,
  examinationId,
  trendClassId,
  trendSectionId,
  fromMonth,
  toMonth,
}: {
  examinations: Array<{ id: string; name: string }>;
  examinationId: string;
  trendClassId: string;
  trendSectionId: string;
  fromMonth: string;
  toMonth: string;
}) {
  return (
    <form method="get" className="flex items-end gap-2">
      <input type="hidden" name="trendClassId" value={trendClassId} />
      <input type="hidden" name="trendSectionId" value={trendSectionId} />
      <input type="hidden" name="fromMonth" value={fromMonth} />
      <input type="hidden" name="toMonth" value={toMonth} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Examination</label>
        <select name="examinationId" defaultValue={examinationId} className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="">Select…</option>
          {examinations.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
        Load
      </button>
    </form>
  );
}
