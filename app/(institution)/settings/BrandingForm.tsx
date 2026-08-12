"use client";

import { useActionState, useState } from "react";
import { updateBrandingAction } from "./actions";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export default function BrandingForm({ currentColor, defaultColor }: { currentColor: string | null; defaultColor: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateBrandingAction, { error: null });
  const [color, setColor] = useState(currentColor ?? defaultColor);
  const validHex = HEX_COLOR.test(color);

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={validHex ? color : defaultColor}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-zinc-300 p-1"
          aria-label="Pick a brand colour"
        />
        <input
          name="primaryColor"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#2563eb"
          maxLength={7}
          className="w-32 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-mono"
        />
        <button
          type="submit"
          disabled={pending || !validHex}
          className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          Save colour
        </button>
        {currentColor ? (
          // Same <form>, a second named submit button — the browser includes
          // whichever button was actually clicked in the submitted FormData
          // (reset="true" here), so this can't be nested <form>-in-<form>
          // (invalid HTML) while still being a distinct, explicit action
          // from "Save colour".
          <button
            type="submit"
            name="reset"
            value="true"
            disabled={pending}
            formNoValidate
            className="text-xs text-zinc-500 underline hover:text-zinc-900 disabled:opacity-50"
          >
            Reset to default ({defaultColor})
          </button>
        ) : null}
      </div>
      {!validHex ? <p className="text-xs text-red-600">Enter a 6-digit hex colour, e.g. #2563eb.</p> : null}
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
