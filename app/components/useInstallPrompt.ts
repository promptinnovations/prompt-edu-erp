"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** §382/§InstallAppButton follow-up ("Install button ... available for all
 *  in the sidepanel at the bottom") — the beforeinstallprompt/appinstalled/
 *  manifest-mismatch detection logic InstallAppButton.tsx already built,
 *  extracted into a hook so the new compact sidebar button
 *  (SidebarInstallButton.tsx) can share it instead of re-implementing the
 *  same event wiring a second time. Behavior is unchanged from the
 *  original component — see InstallAppButton.tsx's own doc comment for why
 *  the manifest-mismatch check and iOS fallback exist. */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"accepted" | "dismissed" | null>(null);
  const [manifestMismatch, setManifestMismatch] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream);

    const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? "";
    const institutionSegment = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
    if (institutionSegment && manifestHref) {
      setManifestMismatch(!manifestHref.startsWith(`/${institutionSegment}/`));
    }

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

  return { deferredPrompt, installed, isIos, busy, outcome, manifestMismatch, handleInstall };
}
