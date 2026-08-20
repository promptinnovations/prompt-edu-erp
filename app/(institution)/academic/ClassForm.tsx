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
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t("className")}</label>
        <input
          name="name"
          required
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          placeholder="e.g. Grade 5"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Stage</label>
        <input
          name="stage"
          className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          placeholder="e.g. LP, UP, HS"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        {t("add")}
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
