import type { MetadataRoute } from "next";
import { getRequestContext } from "../services/request-context";
import { getInstitution } from "../services/institution/institution-service";

/**
 * PROMPT EDU ERP — dynamic PWA manifest (ARCHITECTURE.md §R.1). Served at
 * /manifest.webmanifest via Next.js's manifest.ts convention. When the
 * requester has an active institution session, the manifest reflects that
 * institution's own app name/branding (§13) while the underlying code stays
 * identical across every institution. Falls back to generic PROMPT EDU ERP
 * branding when no institution context is available (e.g. the public
 * /login page).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const ctx = await getRequestContext().catch(() => null);
  const institution = ctx?.institutionId
    ? await getInstitution(ctx.institutionId, ctx.session.authUserId).catch(() => null)
    : null;

  const name = institution?.appName || institution?.name || "PROMPT EDU ERP";

  return {
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description: "PROMPT EDU ERP — Technology with Purpose. A product of Prompt Innovations.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
