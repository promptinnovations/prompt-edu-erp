import type { ExaminationRecord } from "../../../../modules/examination/service";

/** Plain GET form — the whole page (roster counts, generate form, chart)
 *  renders server-side for whichever examination is in the URL, so the
 *  chosen exam survives a reload and can be linked to directly. */
export default function ExamPicker({
  examinations, examinationId,
}: {
  examinations: ExaminationRecord[];
  examinationId: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Examination</label>
        <select
          name="examinationId"
          defaultValue={examinationId}
          className="w-72 rounded-full border bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Select…</option>
          {examinations.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
        Load
      </button>
      {examinations.length === 0 ? (
        <span className="pb-2 text-sm text-zinc-500">No examinations created yet.</span>
      ) : null}
    </form>
  );
}
