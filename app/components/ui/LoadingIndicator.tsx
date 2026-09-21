/**
 * Design system Phase 4 (states/feedback audit) — a shared loading state
 * for Next.js App Router route segments. Rendered automatically by each
 * `loading.tsx` while a page's server data is being fetched, replacing
 * what was previously a blank/frozen screen during navigation (this app
 * had no `loading.tsx` anywhere — see the Phase 2/3 commits' audit notes).
 *
 * Colour comes from `var(--brand)`, the same institution-palette-aware
 * variable every solid CTA button in the app already uses, so the spinner
 * matches whichever palette the institution has picked rather than a
 * fixed colour.
 */
export default function LoadingIndicator({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 py-12 text-zinc-500" role="status" aria-live="polite">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-8 w-8 animate-spin text-[var(--brand)]"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  );
}
