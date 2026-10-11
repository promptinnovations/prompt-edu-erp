"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { selectChildAction } from "./actions";

export interface ChildOption { id: string; full_name: string; relationship: string | null }

/** Switch which child the parent portal shows. The choice is remembered
 *  server-side (selectChildAction → cookie) so every sidebar page follows
 *  it; the current page reloads in place for the new child. Hidden when the
 *  parent has only one child. `tone="light"` is for the coloured hero. */
export default function ChildPicker({
  options, selectedChildId, tone = "default",
}: {
  options: ChildOption[]; selectedChildId: string; tone?: "default" | "light";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  if (options.length <= 1) return null;
  const light = tone === "light";
  return (
    <label className={`flex flex-col text-xs ${light ? "text-white/85" : "text-zinc-500"}`}>
      <span className="mb-1">Viewing</span>
      <select
        value={selectedChildId}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            await selectChildAction(id);
            router.replace(pathname);
            router.refresh();
          });
        }}
        className={light
          ? "rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-white/60 [&>option]:text-zinc-900"
          : "rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-400"}
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>{c.full_name}{c.relationship ? ` (${c.relationship})` : ""}</option>
        ))}
      </select>
    </label>
  );
}
