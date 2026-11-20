"use client";

import { useActionState, useState } from "react";
import { updateInstitutionThemeAction } from "./actions";

export interface PaletteChoice {
  id: string;
  label: string;
  primary: string;
  accent: string;
  sidebar: string;
  ground: string;
  darkSidebar: boolean;
}

/** §Brand-kit — Settings → Appearance. The institution picks one of the
 *  approved colour directions (Scholar Teal is the default); the whole app,
 *  portals, login screen, report cards and installed-app icon follow it. */
export default function AppearanceForm({ choices, current, defaultId }: { choices: PaletteChoice[]; current: string; defaultId: string }) {
  const [state, action, pending] = useActionState<{ error: string | null; saved?: boolean }, FormData>(updateInstitutionThemeAction, { error: null });
  const [selected, setSelected] = useState(current);

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {choices.map((c) => {
          const on = selected === c.id;
          return (
            <label
              key={c.id}
              className={`cursor-pointer overflow-hidden rounded-xl border bg-white transition ${on ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "hover:border-zinc-400"}`}
            >
              <input type="radio" name="themePalette" value={c.id} checked={on} onChange={() => setSelected(c.id)} className="sr-only" />
              {/* Mini preview: sidebar rail + page with a button and an accent chip */}
              <div className="flex h-16" aria-hidden="true" style={{ background: c.ground }}>
                <div className="w-1/4 border-r" style={{ background: c.sidebar }}>
                  <div className="mx-1.5 mt-2 h-1.5 rounded" style={{ background: c.darkSidebar ? "rgba(255,255,255,.35)" : c.primary, opacity: c.darkSidebar ? 1 : 0.25 }} />
                  <div className="mx-1.5 mt-1 h-1.5 rounded" style={{ background: c.darkSidebar ? "rgba(255,255,255,.2)" : "#e5e7eb" }} />
                  <div className="mx-1.5 mt-1 h-1.5 rounded" style={{ background: c.darkSidebar ? "rgba(255,255,255,.2)" : "#e5e7eb" }} />
                </div>
                <div className="flex flex-1 flex-col justify-center gap-1.5 px-2.5">
                  <div className="h-2 w-2/3 rounded bg-white" />
                  <div className="flex items-center gap-1.5">
                    <span className="h-3.5 w-10 rounded-full" style={{ background: c.primary }} />
                    <span className="h-3 w-5 rounded-full" style={{ background: c.accent }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium text-zinc-800">{c.label}</span>
                {c.id === defaultId ? <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600">Default</span> : null}
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || selected === current} className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {pending ? "Saving…" : "Use these colours"}
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.saved && !state.error ? <span className="text-sm text-emerald-700">Saved — the app now uses {choices.find((c) => c.id === current)?.label}.</span> : null}
      </div>
    </form>
  );
}
