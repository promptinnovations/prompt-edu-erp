"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createClassAction } from "./actions";

export default function ClassForm() {
  const t = useTranslations("academic");
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createClassAction, { error: null });
  return (
    <form action={formAction} className="flex items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">{t("className")}</label>
        <input
          name="name"
          required
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          placeholder="e.g. Grade 5"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        {t("add")}
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
