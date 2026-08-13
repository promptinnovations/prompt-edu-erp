"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createSectionAction } from "./actions";

export default function SectionForm({ classes }: { classes: Array<{ id: string; name: string }> }) {
  const t = useTranslations("academic");
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createSectionAction, { error: null });
  return (
    <form action={formAction} className="flex items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t("selectClass")}</label>
        <select name="classId" required className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t("sectionName")}</label>
        <input name="name" required className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" placeholder="e.g. A" />
      </div>
      <button
        type="submit"
        disabled={pending || classes.length === 0}
        className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        {t("add")}
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
