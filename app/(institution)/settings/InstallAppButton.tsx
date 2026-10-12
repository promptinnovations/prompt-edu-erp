"use client";

/**
 * §382 Institution branding & separate app — discoverable "Install app" UI.
 * The per-institution manifest/scope/start_url/icon (services/branding/
 * app-identity.ts, wired into app/layout.tsx + app/manifest.ts +
 * app/icon-badge/[size]/route.tsx) already makes every institution an
 * independently-installable PWA branded with its own name/logo — this
 * component is just the missing "install" trigger the user can actually
 * find and tap, plus a fallback for browsers (iOS Safari, mainly) that
 * never fire `beforeinstallprompt` at all.
 *
 * Follow-up ("Install still offers PROMPT EDU ERP, not the institute's
 * own app") -- confirmed server-side identity resolution is correct (a
 * fresh fetch of this exact page's <link rel="manifest"> always returns
 * the right institution). The mismatch is a client-side browser quirk:
 * `beforeinstallprompt` fires once per real document load, tied to
 * whichever manifest was associated with THAT load -- if the user's
 * very first hard navigation into this app (this tab/session) was to a
 * non-institution URL (bare domain, /login, a stale bookmark) before
 * ever reaching /<code>/..., Chrome captures generic branding then and
 * does not re-evaluate it on subsequent same-tab client-side (SPA)
 * navigations, even after the <link> tag's href updates. Detected here
 * by comparing the CURRENT <link rel="manifest"> href against the
 * current URL's institution segment; on a mismatch, a real
 * `location.reload()` is offered instead of the (in that case, stale)
 * captured event -- a genuine fresh document load re-associates the
 * correct manifest and the next paint fires a correctly-scoped
 * `beforeinstallprompt`.
 */
import { useInstallPrompt } from "../../components/useInstallPrompt";

export default function InstallAppButton({ appName, logoUrl }: { appName: string; logoUrl: string | null }) {
  const { installed, busy, outcome, highlight, showHint, hintText, install } = useInstallPrompt();

  if (installed) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        {appName} is installed on this device.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-10 w-10 rounded-lg border object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] text-sm font-semibold text-white">
            {appName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-zinc-800">{appName}</p>
          <p className="text-xs text-zinc-500">Add this institution&apos;s own app to your computer or phone.</p>
        </div>
      </div>

      <div className="flex flex-col gap-1 sm:ml-auto sm:max-w-xs sm:items-end">
        <button
          type="button"
          onClick={install}
          disabled={busy}
          className={`rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50 ${highlight ? "animate-pulse" : ""}`}
        >
          {busy ? "Installing…" : highlight ? "Tap to install" : "Install app"}
        </button>
        {showHint ? <p role="status" className="text-xs text-zinc-500 sm:text-right">{hintText}</p> : null}
        {outcome === "dismissed" ? <p className="text-xs text-zinc-500">Install cancelled — you can try again anytime.</p> : null}
      </div>
    </div>
  );
}
