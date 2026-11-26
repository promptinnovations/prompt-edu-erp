"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Pick the division and the date. A teacher (or anyone with a handful of
 * divisions) taps their division — no dropdowns, no "Load" button; the date
 * reloads the register as soon as it is changed. Somebody who can see very
 * many divisions (admin) keeps the class / division lists.
 */
const CHIP_LIMIT = 14;

export default function ClassSectionPicker({
  classes, sections, classId, sectionId, date,
}: {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; class_id: string; name: string }>;
  classId: string; sectionId: string; date: string;
}) {
  const router = useRouter();
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const pairs = sections
    .filter((s) => className.has(s.class_id))
    .map((s) => ({ classId: s.class_id, sectionId: s.id, label: `${className.get(s.class_id)} ${s.name}` }));
  const href = (c: string, s: string, d: string) => `?classId=${c}&sectionId=${s}&date=${d}`;

  const dateField = (
    <div>
      <label className="mb-1 block text-xs text-zinc-500" htmlFor="att-date">Date</label>
      <input
        id="att-date" type="date" defaultValue={date} autoComplete="off"
        className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        onChange={(e) => { if (e.target.value) router.push(href(classId, sectionId, e.target.value)); }}
      />
    </div>
  );

  if (pairs.length > 0 && pairs.length <= CHIP_LIMIT) {
    return (
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1 text-xs text-zinc-500">Your divisions — tap one</p>
          <div className="flex flex-wrap gap-2">
            {pairs.map((p) => {
              const active = p.classId === classId && p.sectionId === sectionId;
              return (
                <Link
                  key={p.sectionId} href={href(p.classId, p.sectionId, date)} prefetch={false} scroll={false}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium ${active ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--border-subtle)] bg-white hover:bg-primary-50"}`}
                >{p.label}</Link>
              );
            })}
          </div>
        </div>
        {dateField}
      </div>
    );
  }

  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Class</label>
        <select name="classId" defaultValue={classId} className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="">Select…</option>
          {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Division</label>
        <select name="sectionId" defaultValue={sectionId} className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="">Select…</option>
          {sections.filter((s) => !classId || s.class_id === classId).map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Date</label>
        <input autoComplete="off" type="date" name="date" defaultValue={date} className="rounded-full border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <button type="submit" className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">Load</button>
    </form>
  );
}
