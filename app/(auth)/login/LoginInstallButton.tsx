"use client";

import { useState } from "react";
import { useInstallPrompt } from "../../components/useInstallPrompt";

/** §"app install button should be there in every log in — in every
 *  tenants" — SidebarInstallButton.tsx (app-wide, post-login) is styled for
 *  the dark sidebar footer and never renders on this pre-auth screen at all
 *  (the login page has no ResponsiveSidebar around it). Same shared
 *  useInstallPrompt() hook, restyled here for the light login card so every
 *  institution's own /<code>/login (and the generic /login) offers the
 *  install prompt too, not just once a user is already signed in. */
export default function LoginInstallButton() {
  const { deferredPrompt, installed, isIos, busy, manifestMismatch, handleInstall } = useInstallPrompt();
  const [showHint, setShowHint] = useState(false);

  if (installed) return null;

  const DownloadIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 19.5h16" />
    </svg>
  );
  const buttonClass =
    "flex w-full items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]";

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
        <p className="mt-1.5 text-center text-[10px] leading-snug text-zinc-500">
          {isIos
            ? 'Tap the Share icon in Safari, then "Add to Home Screen".'
            : 'Open your browser menu and look for "Install app" or "Add to Home screen".'}
        </p>
      ) : null}
    </div>
  );
}
