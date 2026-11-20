"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type ActionResult = { error: string | null; ok?: string | null };
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * One small wrapper for every Events & Activities form: runs the server
 * action, shows its error or success line next to the button, and clears
 * the form after a successful "add" (resetOnSuccess).
 */
export default function ActionForm({
  action, children, submitLabel, pendingLabel, className = "", buttonClassName, resetOnSuccess = false, confirm, variant = "primary",
}: {
  action: Action; children?: ReactNode; submitLabel: string; pendingLabel?: string; className?: string;
  buttonClassName?: string; resetOnSuccess?: boolean; confirm?: string; variant?: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { error: null });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  const btn =
    buttonClassName ??
    (variant === "primary"
      ? "rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
      : variant === "danger"
        ? "rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        : "rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-[var(--surface-muted)] disabled:opacity-50");

  return (
    <form
      ref={ref}
      action={formAction}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className={className}
    >
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={btn}>{pending ? pendingLabel ?? "Saving…" : submitLabel}</button>
        {state.error ? <span role="alert" className="text-xs text-red-700">{state.error}</span> : null}
        {state.ok ? <span className="text-xs text-primary-700">{state.ok}</span> : null}
      </div>
    </form>
  );
}
