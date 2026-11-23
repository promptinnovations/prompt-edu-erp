"use client";

import Link from "next/link";
import { useState } from "react";
import { inputClass } from "../../components/ui/form-classes";

export interface NavItem { key: string; label: string }

/**
 * For authorised people: a search box at the top (a class or a person), and
 * two buttons — Classes and Teachers — each opening every timetable of that
 * kind as tap-able chips, classes in school order (e.g. BB1 A, BB1 B, BB2 A …
 * 11, 12), teachers A–Z. Typing in the search box looks through both lists.
 */
export default function TimetableNavigator({ classes, teachers, mineKey, selectedKey }: {
  classes: NavItem[]; teachers: NavItem[]; mineKey: string | null; selectedKey: string;
}) {
  const [tab, setTab] = useState<"c" | "t">(selectedKey.startsWith("t:") && selectedKey !== mineKey ? "t" : "c");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const match = (i: NavItem) => i.label.toLowerCase().includes(query);
  const chip = (i: NavItem) => (
    <Link
      key={i.key} href={`/timetable?show=${encodeURIComponent(i.key)}`} prefetch={false}
      className={`rounded-full border px-3 py-1 text-sm ${i.key === selectedKey ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-primary-50"}`}
    >{i.label}</Link>
  );
  const tabBtn = (id: "c" | "t", label: string, n: number) => (
    <button
      type="button" onClick={() => { setTab(id); setQ(""); }}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${!query && tab === id ? "bg-[var(--brand)] text-white" : "border border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-primary-50"}`}
    >{label} <span className="opacity-70">({n})</span></button>
  );
  const group = (title: string, items: NavItem[]) => items.length === 0 ? null : (
    <div>
      {query ? <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">{title}</p> : null}
      <div className="flex flex-wrap gap-2">{items.map(chip)}</div>
    </div>
  );
  const fc = query ? classes.filter(match) : classes;
  const ft = query ? teachers.filter(match) : teachers;

  return (
    <div className="no-print space-y-3 rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
          placeholder="Search a class or a person…" aria-label="Search a class or a person"
          className={`${inputClass} w-full sm:w-72`}
        />
        {mineKey ? chip({ key: mineKey, label: "My timetable" }) : null}
        <span className="mx-1 hidden h-6 w-px bg-[var(--border-subtle)] sm:block" />
        {tabBtn("c", "Classes", classes.length)}
        {tabBtn("t", "Teachers", teachers.length)}
      </div>
      <div className="max-h-56 space-y-3 overflow-y-auto">
        {query ? (
          fc.length + ft.length === 0 ? <p className="text-sm text-zinc-500">Nothing matches “{q}”.</p> : <>{group("Classes", fc)}{group("Teachers", ft)}</>
        ) : tab === "c" ? group("Classes", classes) : group("Teachers", teachers)}
      </div>
    </div>
  );
}
