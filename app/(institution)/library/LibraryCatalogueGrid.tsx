"use client";

import { useMemo, useState } from "react";

export interface CatalogueBook {
  id: string;
  title: string;
  subtitle: string | null;
  author_name: string | null;
  category_name: string | null;
  shelf_name: string | null;
  available_copies: number;
  total_copies: number;
}

// Same 8-colour palette as AttendanceStageTrendChart.tsx/PassRateStageTrendChart.tsx's
// STAGE_COLORS (kept in sync, per that file's own comment on the pattern) —
// reused here as book "spine" accent colours, hashed off category name so
// the same category always lands on the same colour without a schema
// change (books has no cover_file_id/colour column, §422).
const SPINE_COLORS = ["#4f46e5", "#0891b2", "#c026d3", "#ea580c", "#65a30d", "#0d9488", "#9333ea", "#dc2626"];

function colorForCategory(name: string | null): string {
  if (!name) return "#71717a"; // zinc-500 — uncategorised
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return SPINE_COLORS[hash % SPINE_COLORS.length];
}

/** §422 "library catalogue should have an attractive UI" — was a plain
 *  5-column table with no search/filter. Books have no cover image field
 *  (no schema change here), so "attractive" is a colour-coded card grid —
 *  each card gets a "spine" accent bar coloured by category (deterministic
 *  hash, same category = same colour every time) — plus client-side
 *  search/filter, since the catalogue is exactly the kind of list a
 *  librarian scans and searches, not just reads top to bottom. */
export default function LibraryCatalogueGrid({ books }: { books: CatalogueBook[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(books.map((b) => b.category_name).filter((c): c is string => !!c))).sort(),
    [books]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter((b) => {
      if (category && b.category_name !== category) return false;
      if (onlyAvailable && b.available_copies <= 0) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.author_name ?? "").toLowerCase().includes(q) ||
        (b.subtitle ?? "").toLowerCase().includes(q)
      );
    });
  }, [books, search, category, onlyAvailable]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or author…"
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
          Available only
        </label>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{filtered.length} of {books.length} books</span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
          {books.length === 0 ? "No books yet." : "No books match your search."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((b) => {
            const spine = colorForCategory(b.category_name);
            const isAvailable = b.available_copies > 0;
            return (
              <div
                key={b.id}
                className="group overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="h-2" style={{ backgroundColor: spine }} />
                <div className="p-3">
                  <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {b.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {b.author_name ?? "Unknown author"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {b.category_name ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: spine }}
                      >
                        {b.category_name}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        isAvailable
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {b.available_copies}/{b.total_copies} available
                    </span>
                  </div>
                  {b.shelf_name ? (
                    <div className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">Shelf: {b.shelf_name}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
