"use client";

import { useState } from "react";
import { useInstallPrompt } from "./useInstallPrompt";

/** "Install button of the app available for all in the sidepanel at the
 *  bottom" follow-up — a compact counterpart to Settings' InstallAppButton
 *  (app/(institution)/settings/InstallAppButton.tsx), sharing the same
 *  useInstallPrompt() hook, rendered once inside ResponsiveSidebar.tsx so
 *  it shows up identically in every role's rail (institution, portal,
 *  super-admin) rather than only on the Settings page. Sized/styled for
 *  the dark, narrow sidebar footer rather than a full-width settings card. */
export default function SidebarInstallButton() {
  const { deferredPrompt, installed, isIos, busy, manifestMismatch, handleInstall } = useInstallPrompt();
  const [showHint, setShowHint] = useState(false);

  if (installed) return null; // nothing actionable — keep the rail uncluttered

  const DownloadIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 19.5h16" />
    </svg>
  );
  const buttonClass =
    "flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--sidebar-border)] px-3 py-2 text-xs font-medium text-[var(--sidebar-text-muted)] transition-colors hover:bg-[var(--sidebar-active)] hover:text-white";

  if (manifestMismatch) {
    return (
      <button type="button" onClick={() => window.location.reload()} className={buttonClass}>
        {DownloadIcon} Refresh to install
      </button>
    );
  }

  if (deferredPrompt) {
    return (
      <button type="button" onClick={handleInstall} disabled={busy} className={`${buttonClass} disabled:opacity-50`}>
        {DownloadIcon} {busy ? "Installing…" : "Install app"}
      </button>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setShowHint((v) => !v)} className={buttonClass}>
        {DownloadIcon} Install app
      </button>
      {showHint ? (
        <p className="mt-1.5 px-1 text-[10px] leading-snug text-[var(--sidebar-text-muted)]">
          {isIos
            ? 'Tap the Share icon in Safari, then "Add to Home Screen".'
            : 'Open your browser menu and look for "Install app" or "Add to Home screen".'}
        </p>
      ) : null}
    </div>
  );
}
