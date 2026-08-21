"use client";

import { useState } from "react";

const DAYS = [
  { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" }, { value: 7, label: "Sunday" },
];

export default function TimetableTemplateForm({ classes }: { classes: Array<{ id: string; name: string }> }) {
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [periodsPerDay, setPeriodsPerDay] = useState(8);

  const toggleClass = (id: string) => setSelectedClassIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  const toggleDay = (d: number) => setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const downloadUrl = `/api/substitution/timetable-template?classIds=${selectedClassIds.join(",")}&days=${selectedDays.join(",")}&periodsPerDay=${periodsPerDay}`;
  const canDownload = selectedClassIds.length > 0 && selectedDays.length > 0 && periodsPerDay >= 1;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Choose which classes, working days, and periods per day this institution runs — the downloaded template
        will already have one row per class/section × day × period, so you only need to fill in Subject and
        Teacher staff code before re-uploading it via Bulk Import.
      </p>

      <div>
        <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Classes</p>
        <div className="flex flex-wrap gap-2">
          {classes.map((c) => (
            <label key={c.id} className="flex items-center gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs">
              <input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => toggleClass(c.id)} /> {c.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Working days</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs">
              <input type="checkbox" checked={selectedDays.includes(d.value)} onChange={() => toggleDay(d.value)} /> {d.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Periods per day</label>
        <input
          type="number" min={1} max={20} value={periodsPerDay}
          onChange={(e) => setPeriodsPerDay(Number(e.target.value))}
          className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
        />
      </div>

      {canDownload ? (
        <a href={downloadUrl} className="inline-block rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
          Download configured template
        </a>
      ) : (
        <p className="text-xs text-zinc-400">Select at least one class and one working day to enable download.</p>
      )}
    </div>
  );
}
