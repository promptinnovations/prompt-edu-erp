"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Design system Phase 2 (component inventory audit) — a reusable,
 * on-brand replacement for the native `confirm()` browser dialog that had
 * been used ad hoc at 15+ call sites to gate a destructive/consequential
 * form submission. The native dialog can't be styled, doesn't match the
 * app's branding or the institution's chosen palette, and its wording
 * ("This page says…") is not reassuring in front of end users.
 *
 * Drop-in usage — this changes ONLY the confirmation UI, not the
 * underlying submission: the form still posts to the same Server Action
 * exactly as before.
 *
 *   Before:
 *     <form action={deleteAction} onSubmit={(e) => { if (!confirm(MSG)) e.preventDefault(); }}>
 *       <input type="hidden" name="id" value={id} />
 *       <button type="submit" className="...">Delete</button>
 *     </form>
 *
 *   After:
 *     <form action={deleteAction}>
 *       <input type="hidden" name="id" value={id} />
 *       <ConfirmSubmitButton message={MSG} className="...">Delete</ConfirmSubmitButton>
 *     </form>
 *
 * The button renders with the exact same type, className, disabled and
 * children props a plain <button type="submit"> would have had; clicking
 * it opens a branded dialog, and only on explicit confirm does it call
 * form.requestSubmit() — the same DOM API a real submit click would use,
 * so React 19 / Next.js Server Actions wiring on the <form> is untouched.
 */
export default function ConfirmSubmitButton({
  message,
  children,
  className,
  disabled,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
}: {
  message: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive actions (delete/remove), "default" for
   *  consequential-but-not-destructive ones (promote, set current year). */
  tone?: "danger" | "default";
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={confirmLabel}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-sand-300 bg-white p-5 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-body">{message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.form?.requestSubmit();
                }}
                className={
                  tone === "danger"
                    ? "rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
                    : "rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand-hover)]"
                }
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
