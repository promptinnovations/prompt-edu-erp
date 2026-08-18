"use client";

/** Shared "Print Center" follow-up — every printable page (registers,
 *  report cards, consolidated marks) uses this same button + globals.css's
 *  `.print-area`/`.no-print`/`[data-app-shell]` rules, so window.print()
 *  only ever renders the wrapped content, not the nav/header chrome. */
export default function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print flex items-center gap-1.5 rounded-lg bg-[var(--accent-teal)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-teal-hover)]"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
        <path d="M7 8V3.5h10V8" /><rect x="4" y="8" width="16" height="8" rx="1.5" /><path d="M7 15.5h10V20.5H7Z" />
      </svg>
      {label}
    </button>
  );
}
