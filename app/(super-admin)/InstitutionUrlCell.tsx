"use client";

import { useActionState, useState } from "react";
import { updateInstitutionCodeAction } from "./actions";

/** §137 follow-up: each institution's shareable URL (baseUrl + "/" + code,
 *  e.g. https://prompt-edu-erp.vercel.app/kemhs — see app/[code]/route.ts),
 *  shown only here (after the institution already exists), copyable, and
 *  the code itself editable in place. baseUrl is computed server-side from
 *  the actual request host (super-admin/page.tsx), so this works
 *  identically on prompt-edu-erp.vercel.app, a custom domain, or
 *  localhost — no env var to configure. */
export default function InstitutionUrlCell({
  institutionId,
  code,
  baseUrl,
}: {
  institutionId: string;
  code: string;
  baseUrl: string;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateInstitutionCodeAction, { error: null });
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = `${baseUrl}/${code}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable (e.g. non-HTTPS local
      // access) — the URL is still visible as plain text to copy by hand.
    }
  }

  if (editing) {
    return (
      <form
        action={formAction}
        className="flex items-center gap-1"
        onSubmit={() => {
          // Optimistically leave edit mode; a real error re-shows below via
          // state.error without kicking the row back into edit mode again,
          // matching this app's other inline-edit forms.
          setEditing(false);
        }}
      >
        <input type="hidden" name="institutionId" value={institutionId} />
        <input
          name="code"
          defaultValue={code}
          required
          pattern="[a-z0-9-]+"
          title="Lowercase letters, numbers, and hyphens only."
          className="w-28 rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs font-mono"
        />
        <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200">
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400" title={url}>{url}</span>
        <button type="button" onClick={copyUrl} className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-200">
          Edit
        </button>
      </div>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </div>
  );
}
