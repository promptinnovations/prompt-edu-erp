"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PwaWindow = Window & {
  __pwaPrompt?: BeforeInstallPromptEvent | null;
  __pwaPromptManifest?: string | null;
  __pwaInstalled?: boolean;
};

function manifestHref(): string {
  return document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? "";
}

/** Where to load so the browser evaluates THIS page's app manifest, or
 *  null when the current document is already right. Two cases:
 *   - the page links an institution manifest (/<code>/manifest.webmanifest)
 *     but the address bar is outside /<code>/ (e.g. a bare /dashboard), so
 *     the browser won't treat the page as that app;
 *   - the install event was captured for a different manifest earlier in
 *     this tab (an in-app navigation from /login into /<code>/...), and
 *     browsers only re-evaluate on a real page load. */
function reloadTarget(w: PwaWindow): string | null {
  const href = manifestHref();
  const path = w.location.pathname;
  const m = /^\/([^/]+)\/manifest\.webmanifest/.exec(href);
  if (m) {
    const prefix = `/${m[1]}`.toLowerCase();
    const p = path.toLowerCase();
    if (p !== prefix && !p.startsWith(`${prefix}/`)) return `/${m[1]}${path === "/" ? "/dashboard" : path}`;
  }
  if (w.__pwaPrompt && w.__pwaPromptManifest != null && w.__pwaPromptManifest !== href) return path;
  return null;
}

/** §Install-button ("this must be an install button — if clicked, the app
 *  should get installed on the computer or mobile"). One action, install():
 *   1. the browser's own install dialog when it's available (Chrome, Edge,
 *      Samsung Internet, most Android browsers) — captured early by the
 *      inline boot script in app/layout.tsx so it isn't missed before
 *      hydration;
 *   2. otherwise, if this page isn't loaded as the right app yet, a real
 *      load of the right URL with ?install=1, after which the button
 *      reads "Tap to install" and opens the dialog in one tap (browsers
 *      require a tap — they never allow installing without one);
 *   3. otherwise (iPhone/iPad Safari, Firefox, already-installed) short
 *      instructions for that browser.
 *  Shared by the sidebar, login and Settings install buttons. */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"accepted" | "dismissed" | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintText, setHintText] = useState("");
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    const w = window as PwaWindow;
    const nav = w.navigator as Navigator & { standalone?: boolean };
    const standalone = w.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
    setInstalled(standalone || w.__pwaInstalled === true);

    const ua = nav.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
    const android = /android/i.test(ua);
    const firefoxDesktop = /firefox/i.test(ua) && !android;
    const safariMac = /safari/i.test(ua) && /macintosh/i.test(ua) && !/chrome|chromium|edg/i.test(ua) && !ios;
    setHintText(
      ios
        ? 'On iPhone/iPad: tap the Share button in Safari, then "Add to Home Screen".'
        : safariMac
          ? 'In Safari: choose File → "Add to Dock".'
          : firefoxDesktop
            ? "This browser can't install apps. Open this page in Chrome or Edge and press Install again."
            : android
              ? 'Open the browser menu (⋮) and tap "Install app" or "Add to Home screen". If it\'s already installed, open it from your home screen.'
              : 'Click the install icon at the right end of the address bar, or open the browser menu → "Install". If it\'s already installed, open it from your apps.'
    );

    if (w.__pwaPrompt) setDeferredPrompt(w.__pwaPrompt);

    const url = new URL(w.location.href);
    if (url.searchParams.get("install") === "1") {
      setHighlight(true);
      url.searchParams.delete("install");
      w.history.replaceState(w.history.state, "", url.pathname + url.search + url.hash);
    }

    const onPrompt = () => setDeferredPrompt(w.__pwaPrompt ?? null);
    const onNativePrompt = (e: Event) => {
      // In case the boot script didn't run (it always should).
      e.preventDefault();
      w.__pwaPrompt = e as BeforeInstallPromptEvent;
      if (w.__pwaPromptManifest == null) w.__pwaPromptManifest = manifestHref();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    w.addEventListener("pwa:prompt", onPrompt);
    w.addEventListener("beforeinstallprompt", onNativePrompt);
    w.addEventListener("pwa:installed", onInstalled);
    w.addEventListener("appinstalled", onInstalled);
    return () => {
      w.removeEventListener("pwa:prompt", onPrompt);
      w.removeEventListener("beforeinstallprompt", onNativePrompt);
      w.removeEventListener("pwa:installed", onInstalled);
      w.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const w = window as PwaWindow;
    const target = reloadTarget(w);
    if (target) {
      const next = new URL(target, w.location.origin);
      next.search = w.location.search;
      next.searchParams.set("install", "1");
      w.location.assign(next.toString());
      return;
    }
    const ev = w.__pwaPrompt ?? deferredPrompt;
    if (!ev) {
      setShowHint(true);
      return;
    }
    setBusy(true);
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      setOutcome(choice.outcome);
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setShowHint(true);
    } finally {
      // A captured prompt can only be used once.
      w.__pwaPrompt = null;
      setDeferredPrompt(null);
      setHighlight(false);
      setBusy(false);
    }
  }, [deferredPrompt]);

  return {
    /** The browser's install dialog is ready to open. */
    canPrompt: deferredPrompt !== null,
    installed,
    busy,
    outcome,
    /** Came back from a reload for installing — draw attention to the button. */
    highlight: highlight && deferredPrompt !== null,
    showHint,
    hintText,
    install,
  };
}
