"use client";

import { useActionState, useState } from "react";
import { THEME_PALETTES } from "../../services/branding/palettes";

interface PalettePickerProps {
  /** Currently-selected palette id, or null (institution hasn't chosen one
   *  yet — falls back to the platform default; irrelevant for the Super
   *  Admin picker, which always has a real value). */
  currentId: string | null;
  /** Server action — receives a `themePalette` field with the chosen id,
   *  and (institution picker only) a `reset` field when "Use platform
   *  default" is chosen instead of a specific palette. */
  action: (prevState: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;
  /** Institution Settings shows a "use platform default" option (stores
   *  null); the Super Admin platform-wide picker doesn't — it has no
   *  further fallback. */
  allowPlatformDefault?: boolean;
}

/**
 * "Never use dark ... give colour combination options, let them choose
 * best for them, even in Super Admin's console" follow-up — a swatch grid
 * over services/branding/palettes.ts's curated THEME_PALETTES, shared by
 * the institution Settings page and the Super Admin Appearance page so
 * both pick from the exact same list the same way.
 */
export default function PalettePicker({ currentId, action, allowPlatformDefault }: PalettePickerProps) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(action, { error: null });
  const [selected, setSelected] = useState<string | null>(currentId);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {allowPlatformDefault ? (
          <button
            type="submit"
            name="reset"
            value="true"
            formNoValidate
            disabled={pending}
            onClick={() => setSelected(null)}
            className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors disabled:opacity-50 ${
              selected === null ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30" : "border-[var(--border-subtle)] hover:border-[var(--brand)]/50"
            }`}
          >
            <span className="flex h-9 w-full items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] text-[10px] uppercase tracking-wide text-zinc-400">
              Auto
            </span>
            <span className="text-xs font-medium text-[var(--foreground)]">Platform default</span>
          </button>
        ) : null}

        {THEME_PALETTES.map((p) => (
          <button
            key={p.id}
            type="submit"
            name="themePalette"
            value={p.id}
            disabled={pending}
            onClick={() => setSelected(p.id)}
            className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors disabled:opacity-50 ${
              selected === p.id ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30" : "border-[var(--border-subtle)] hover:border-[var(--brand)]/50"
            }`}
          >
            <span className="flex h-9 w-full overflow-hidden rounded-lg">
              {p.swatch.map((hex, i) => (
                <span key={i} className="h-full flex-1" style={{ backgroundColor: hex }} />
              ))}
            </span>
            <span className="text-xs font-medium text-[var(--foreground)]">{p.label}</span>
          </button>
        ))}
      </div>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      <p className="text-xs text-zinc-500">Pick a combination — it applies everywhere as soon as you select it.</p>
    </form>
  );
}
