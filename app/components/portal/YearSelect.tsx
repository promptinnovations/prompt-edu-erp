"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * §Portfolio-years — the academic-year picker for the Learner Record and
 * the staff Portfolio tab. Changing it reloads the page with ?year=<id>
 * (blank = every year), keeping the other query parameters (?childId=,
 * ?tab=). Hidden when printing.
 */
export default function YearSelect({
  years, selected, allLabel = "All years", param = "year",
}: { years: Array<{ id: string; name: string; class_label?: string | null }>; selected: string | null; allLabel?: string | null; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  if (years.length < 2 && allLabel === null) return null;
  return (
    <label className="no-print inline-flex items-center gap-2 text-sm text-zinc-600 print:hidden">
      <span>Academic year</span>
      <select
        value={selected ?? ""}
        onChange={(e) => {
          const q = new URLSearchParams(search.toString());
          if (e.target.value) q.set(param, e.target.value); else q.delete(param);
          router.push(`${pathname}${q.size ? `?${q}` : ""}`);
        }}
        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
      >
        {allLabel !== null ? <option value="">{allLabel}</option> : null}
        {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.class_label ? ` — ${y.class_label}` : ""}</option>)}
      </select>
    </label>
  );
}
