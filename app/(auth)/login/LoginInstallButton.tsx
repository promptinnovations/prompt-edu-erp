"use client";

import { useInstallPrompt } from "../../components/useInstallPrompt";

/** §"app install button should be there in every log in — in every
 *  tenants" — the login card's install button (every institution's own
 *  /<code>/login and the generic /login). Same shared useInstallPrompt()
 *  as the sidebar button; see its doc comment for what install() does. */
export default function LoginInstallButton() {
  const { installed, busy, highlight, showHint, hintText, install } = useInstallPrompt();

  if (installed) return null;

  return (
    <div>
      <button
        type="button"
        onClick={install}
        disabled={busy}
        className={[
          "flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60",
          highlight
            ? "animate-pulse bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]"
            : "border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-zinc-700 hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
        ].join(" ")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 19.5h16" />
        </svg>
        {busy ? "Installing…" : highlight ? "Tap to install" : "Install app"}
      </button>
      {showHint ? <p role="status" className="mt-1.5 text-center text-[11px] leading-snug text-zinc-500">{hintText}</p> : null}
    </div>
  );
}
