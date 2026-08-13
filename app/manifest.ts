import type { MetadataRoute } from "next";
import { getRequestContext } from "../services/request-context";
import { getInstitution } from "../services/institution/institution-service";

/**
 * PROMPT EDU ERP — dynamic PWA manifest (ARCHITECTURE.md §R.1). Served at
 * /manifest.webmanifest via Next.js's manifest.ts convention. When the
 * requester has an active institution session, the manifest reflects that
 * institution's own app name/short name (§13, and the follow-up request
 * "separate apps for each institution ... install as an app ... in that
 * name") while the underlying code stays identical across every
 * institution. Falls back to generic PROMPT EDU ERP branding when no
 * institution context is available (e.g. the public /login page reached
 * without ever visiting an institution's /<code> URL first).
 *
 * Deliberately still uses the one shared icon and the one shared
 * brand/background colour (design refresh, see globals.css) — only the
 * *name* is per-institution. Per-institution icon uploads would need a new
 * storage + upload surface and weren't asked for; the fixed palette was a
 * deliberate earlier decision (§137 follow-up) to retire per-institution
 * colour customisation.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const ctx = await getRequestContext().catch(() => null);
  const institution = ctx?.institutionId
    ? await getInstitution(ctx.institutionId, ctx.session.authUserId).catch(() => null)
    : null;

  const name = institution?.appName || institution?.name || "PROMPT EDU ERP";
  // Prefer the institution's own short code (e.g. "kemhs", already public —
  // it's right there in their install URL) over truncating the full name,
  // which tends to cut mid-word and look broken under a home-screen icon.
  const shortName = institution?.code
    ? institution.code.toUpperCase()
    : name.length > 12
      ? name.slice(0, 12)
      : name;

  return {
    name,
    short_name: shortName,
    description: institution
      ? `${name} — powered by PROMPT EDU ERP, a product of Prompt Innovations.`
      : "PROMPT EDU ERP — Technology with Purpose. A product of Prompt Innovations.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
