import type { MetadataRoute } from "next";
import { getRequestContext } from "../services/request-context";
import { resolveAppIdentity } from "../services/branding/app-identity";

/**
 * PROMPT EDU ERP — dynamic PWA manifest (ARCHITECTURE.md §R.1). Served at
 * /manifest.webmanifest via Next.js's manifest.ts convention. When the
 * requester has an active institution session, the manifest reflects that
 * institution's own app name/short name AND its own distinct install icon
 * (§13, and the follow-up requests "separate apps for each institution ...
 * install as an app ... in that name" / "each institution should see their
 * app either with first letter or the short name, not just with the P").
 * Falls back to generic PROMPT EDU ERP branding + the shared static icon
 * when no institution context is available (e.g. the public /login page
 * reached without ever visiting an institution's /<code> URL first).
 *
 * See services/branding/app-identity.ts for the one shared "what should
 * this app be called/shown as right now" resolver — also used by
 * app/layout.tsx's favicon/apple-touch-icon metadata and by the actual
 * icon graphic at app/icon-badge/[size]/route.tsx, so name/short_name/icon
 * can never drift out of sync with each other.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const ctx = await getRequestContext().catch(() => null);
  const identity = await resolveAppIdentity(ctx);

  return {
    name: identity.name,
    short_name: identity.shortName,
    description: identity.dynamicIcon
      ? `${identity.name} — powered by PROMPT EDU ERP, a product of Prompt Innovations.`
      : "PROMPT EDU ERP — Technology with Purpose. A product of Prompt Innovations.",
    start_url: "/",
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
