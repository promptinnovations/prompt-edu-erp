"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Keeps the open dashboard fresh: every minute it re-reads the page, and when
 *  a NEW unconfirmed substitution appears it beeps and vibrates (best effort —
 *  browsers only allow sound after the person has touched the page once). */
export default function SubstitutionWatcher({ pendingIds }: { pendingIds: string[] }) {
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const prev = seen.current;
    if (prev && pendingIds.some((id) => !prev.has(id))) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          for (const [i, f] of [880, 1175].entries()) {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
            const t = ctx.currentTime + i * 0.22;
            g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            o.start(t); o.stop(t + 0.21);
          }
        }
        navigator.vibrate?.([200, 100, 200]);
      } catch { /* sound is a bonus */ }
    }
    seen.current = new Set(pendingIds);
  }, [pendingIds]);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
