"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createSubjectAction } from "./actions";

export default function SubjectForm() {
  const t = useTranslations("academic");
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createSubjectAction, { error: null });
  return (
    <form action={formAction} className="flex items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t("subjectName")}</label>
        <input
          name="name"
          required
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
          placeholder="e.g. Arabic Language"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      >
        {t("add")}
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
