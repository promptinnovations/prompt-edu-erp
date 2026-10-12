/*
 * PROMPT EDU ERP service worker (§Install-button).
 *
 * Purpose: make the app installable everywhere (older Android Chrome and
 * Samsung Internet only offer "Install" when a service worker with a
 * fetch handler is registered) and show a friendly page instead of the
 * browser's error when a page is opened with no connection.
 *
 * It deliberately caches NOTHING: every request goes to the network
 * exactly as before, so no one can ever see stale marks, attendance or
 * fees. Only page navigations are handled (with navigation preload, so
 * there's no extra delay); scripts, images, API calls and server actions
 * pass straight through untouched.
 */
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You're offline</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#1d2939}
.c{max-width:22rem;margin:1rem;padding:2rem;text-align:center;background:#fff;border:1px solid #eaecf0;border-radius:1rem;box-shadow:0 1px 3px rgba(16,24,40,.08)}
.i{width:3.5rem;height:3.5rem;margin:0 auto 1rem;border-radius:1rem;background:linear-gradient(135deg,#4f46e5,#7c3aed 55%,#a21caf);color:#fff;font:700 1.6rem/3.5rem system-ui,sans-serif}
h1{font-size:1.15rem;margin:0 0 .5rem}p{margin:0 0 1.25rem;color:#475467;font-size:.9rem;line-height:1.45}
button{border:0;border-radius:.6rem;background:#4f46e5;color:#fff;font:600 .9rem system-ui,sans-serif;padding:.65rem 1.2rem;cursor:pointer}</style></head>
<body><div class="c"><div class="i">P</div><h1>You're offline</h1><p>Check your internet connection, then try again. Nothing you've saved is lost.</p><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
      } catch {
        return new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })()
  );
});
