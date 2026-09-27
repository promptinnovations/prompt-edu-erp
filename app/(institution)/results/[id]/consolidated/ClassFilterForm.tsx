"use client";

/** §Page-6 follow-up "Consolidated Marks — select exam, class from
 *  dropdown". The exam is already fixed by this page's own URL; this form
 *  only adds the class filter, same plain GET-form convention as
 *  ExaminationPicker on the Analytics page. */
export default function ClassFilterForm({
  classes,
  classId,
  showAllOption = true,
}: {
  classes: Array<{ id: string; name: string }>;
  classId: string;
  /** §"give access to the consolidated mark list ... of only their
   *  assigned classes not all" — a scoped teacher never gets an "All
   *  classes" choice (that would silently combine every OTHER class this
   *  exam covers too), only their own already-filtered `classes` list. */
  showAllOption?: boolean;
}) {
  return (
    <form method="get" className="flex items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Class</label>
        <select
          name="classId"
          defaultValue={classId}
          className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          {showAllOption ? <option value="">All classes</option> : null}
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
        Filter
      </button>
    </form>
  );
}
