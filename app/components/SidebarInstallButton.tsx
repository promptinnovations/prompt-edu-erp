"use client";

import { useInstallPrompt } from "./useInstallPrompt";

/** "Install button of the app available for all in the sidepanel at the
 *  bottom" — the compact sidebar install button (every role's rail:
 *  institution, portal, super-admin). §Install-button: always one "Install
 *  app" button; useInstallPrompt().install() opens the browser's install
 *  dialog, or prepares the page and then opens it, or explains the steps
 *  for browsers that have no install dialog. Hidden once installed. */
export default function SidebarInstallButton() {
  const { installed, busy, highlight, showHint, hintText, install } = useInstallPrompt();

  if (installed) return null;

  return (
    <div>
      <button
        type="button"
        onClick={install}
        disabled={busy}
        className={[
          "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60",
          highlight
            ? "animate-pulse bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]"
            : "border border-[var(--sidebar-border)] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-active-text)]",
        ].join(" ")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 19.5h16" />
        </svg>
        {busy ? "Installing…" : highlight ? "Tap to install" : "Install app"}
      </button>
      {showHint ? (
        <p role="status" className="mt-1.5 px-1 text-[11px] leading-snug text-[var(--sidebar-text-muted)]">{hintText}</p>
      ) : null}
    </div>
  );
}
