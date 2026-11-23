"use client";

import { useEffect, useState } from "react";

type State = "checking" | "off" | "on" | "denied" | "unsupported" | "needs-install" | "unavailable";

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveOnServer(sub: PushSubscription) {
  await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
}

/** Switch phone alerts on/off for this phone or browser. Alerts arrive in the
 *  phone's notification shade with its normal notification sound. */
export default function PhoneAlerts({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      if (!publicKey) return setState("unavailable");
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await saveOnServer(sub); setState("on"); } else setState("off");
      } catch { setState("unsupported"); }
    })();
  }, [publicKey]);

  async function turnOn() {
    setBusy(true); setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey!) }));
      await saveOnServer(sub);
      setState("on");
      setNote("Phone alerts are on.");
    } catch { setNote("Could not switch alerts on. Please try again."); }
    finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true); setNote("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST" });
    setNote(res.ok ? "Test alert sent — check your notifications." : "Could not send a test alert.");
    setBusy(false);
  }

  const btn = "rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--brand)] hover:bg-primary-50 disabled:opacity-50";
  if (state === "checking" || state === "unavailable") return null;
  return (
    <div className="no-print flex flex-wrap items-center gap-2 text-xs text-zinc-600">
      {state === "off" ? <button type="button" disabled={busy} onClick={turnOn} className={btn}>🔔 Get alerts on this phone</button> : null}
      {state === "on" ? (<><span className="font-medium text-[var(--foreground)]">🔔 Phone alerts on</span><button type="button" disabled={busy} onClick={test} className={btn}>Send test</button><button type="button" disabled={busy} onClick={turnOff} className={btn}>Turn off</button></>) : null}
      {state === "denied" ? <span>Alerts are blocked — allow notifications for this site in your phone or browser settings.</span> : null}
      {state === "needs-install" ? <span>On iPhone: tap Share → “Add to Home Screen”, then open the app from there to get alerts.</span> : null}
      {state === "unsupported" ? <span>This browser can’t show phone alerts.</span> : null}
      {note ? <span aria-live="polite">{note}</span> : null}
    </div>
  );
}
