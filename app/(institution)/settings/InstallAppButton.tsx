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
 */
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallAppButton({ appName, logoUrl }: { appName: string; logoUrl: string | null }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"accepted" | "dismissed" | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari's own (non-standard) flag for "already added to home screen".
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream);

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setBusy(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setOutcome(choice.outcome);
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
    } finally {
      setBusy(false);
    }
  }

  if (installed) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
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
          <img src={logoUrl} alt="" className="h-10 w-10 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-semibold text-white">
            {appName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{appName}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Add this institution&apos;s own app to your device.</p>
        </div>
      </div>

      {deferredPrompt ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={busy}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50 sm:ml-auto"
        >
          {busy ? "Installing…" : "Download / Install app"}
        </button>
      ) : isIos ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 sm:ml-auto sm:max-w-xs">
          On iPhone/iPad: tap the Share icon in Safari, then <strong>&quot;Add to Home Screen&quot;</strong>.
        </p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 sm:ml-auto sm:max-w-xs">
          Not seeing an install button? Open your browser&apos;s menu and look for <strong>&quot;Install app&quot;</strong> or
          <strong> &quot;Add to Home screen&quot;</strong>.
        </p>
      )}

      {outcome === "dismissed" ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Install dismissed — you can try again anytime.</p>
      ) : null}
    </div>
  );
}
