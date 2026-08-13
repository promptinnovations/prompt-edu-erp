"use client";

import { useActionState, useState } from "react";
import { publishAnnouncementAction } from "./actions";

interface RoleOption { code: string; name: string }

export default function PublishAnnouncementForm({ roles }: { roles: RoleOption[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(publishAnnouncementAction, { error: null });
  const [audienceType, setAudienceType] = useState<"all" | "role">("all");

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Title</label>
        <input name="title" required maxLength={300} className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Message</label>
        <textarea name="body" required rows={3} className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Audience</label>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="audienceType" value="all" checked={audienceType === "all"} onChange={() => setAudienceType("all")} />
            Everyone
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="audienceType" value="role" checked={audienceType === "role"} onChange={() => setAudienceType("role")} />
            Specific role(s)
          </label>
        </div>
        {audienceType === "role" ? (
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {roles.map((r) => (
              <label key={r.code} className="flex items-center gap-1.5">
                <input type="checkbox" name="roleCodes" value={r.code} />
                {r.name}
              </label>
            ))}
          </div>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        {pending ? "Publishing…" : "Publish announcement"}
      </button>
      {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
    </form>
  );
}
