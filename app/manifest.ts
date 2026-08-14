import type { MetadataRoute } from "next";
import { getRequestContext } from "../services/request-context";
import { resolveAppIdentity } from "../services/branding/app-identity";

/**
 * PROMPT EDU ERP — dynamic PWA manifest (ARCHITECTURE.md §R.1). Served at
 * /manifest.webmanifest via Next.js's manifest.ts convention. When the
 * requester has an active institution session, the manifest reflects that
 * institution's own app name/short name/install icon AND its own manifest
 * `id` (§13, and the follow-up requests "separate apps for each
 * institution ... install as an app ... in that name" / "I can't download
 * different apps separately" — see services/branding/app-identity.ts for
 * why `id` is what actually makes that possible on one shared origin).
 * Falls back to generic PROMPT EDU ERP branding + the shared static icon
 * when no institution context is available (e.g. the public /login page
 * reached without ever visiting an institution's /<code> URL first).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const ctx = await getRequestContext().catch(() => null);
  const identity = await resolveAppIdentity(ctx);

  return {
    id: identity.appId,
    name: identity.name,
    short_name: identity.shortName,
    description: identity.dynamicIcon
      ? `${identity.name} — powered by PROMPT EDU ERP, a product of Prompt Innovations.`
      : "PROMPT EDU ERP — Technology with Purpose. A product of Prompt Innovations.",
    start_url: identity.startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#4f46e5",
    icons: identity.dynamicIcon
      ? [
          { src: "/icon-badge/192", sizes: "192x192", type: "image/png" },
          { src: "/icon-badge/512", sizes: "512x512", type: "image/png" },
        ]
      : [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
  };
}
