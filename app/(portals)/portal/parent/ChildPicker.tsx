"use client";

import { useRouter } from "next/navigation";

export interface ChildOption { id: string; full_name: string; relationship: string | null }

export default function ChildPicker({
  options, selectedChildId,
}: {
  options: ChildOption[]; selectedChildId: string;
}) {
  const router = useRouter();
  if (options.length <= 1) return null;
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Viewing</label>
      <select
        defaultValue={selectedChildId}
        onChange={(e) => router.push(`/portal/parent?childId=${e.target.value}`)}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>{c.full_name}{c.relationship ? ` (${c.relationship})` : ""}</option>
        ))}
      </select>
    </div>
  );
}
