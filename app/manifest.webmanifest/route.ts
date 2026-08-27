import { getRequestContext } from "../../services/request-context";
import { resolveAppIdentity, resolveAppIdentityByCode } from "../../services/branding/app-identity";

/**
 * PROMPT EDU ERP — dynamic PWA manifest (ARCHITECTURE.md §R.1), served at
 * /manifest.webmanifest. A plain Route Handler rather than Next's
 * manifest.ts metadata-file convention specifically so the response can
 * carry an explicit `Cache-Control: no-store` — manifest.ts's own return
 * type doesn't allow setting response headers, and it defaults to
 * `public, max-age=0, must-revalidate` with no ETag/Last-Modified
 * validator, which was a plausible contributor to a browser continuing to
 * show a previously-fetched institution's name/icon in its install
 * prompt after switching institutions or signing in as a different one
 * in the same tab (§137 follow-up: "downloading still shows Edu ERP").
 *
 * When the requester has an active institution session, the manifest
 * reflects that institution's own app name/short name/install icon AND
 * its own manifest `id` + real /<code>/ scope (see
 * services/branding/app-identity.ts for the full "why" — the `id` and
 * scope/start_url are what make each institution genuinely
 * separately-installable on this one shared origin, not just cosmetics).
 * Falls back to generic PROMPT EDU ERP branding + the shared static icon
 * when no institution context is available (e.g. the public /login page
 * reached without ever visiting an institution's /<code> URL first).
 */
export async function GET(request: Request) {
  // Prefer the URL-derived institution code (see middleware.ts's
  // x-institution-code header + resolveAppIdentityByCode()'s own doc
  // comment) -- correct even when the browser's own manifest-fetch for
  // PWA installability doesn't carry session cookies, which a session-only
  // lookup here silently can't handle.
  const institutionCode = request.headers.get("x-institution-code");
  const identity = institutionCode
    ? await resolveAppIdentityByCode(institutionCode)
    : await resolveAppIdentity(await getRequestContext().catch(() => null));

  const manifest = {
    id: identity.appId,
    name: identity.name,
    short_name: identity.shortName,
    description: identity.dynamicIcon
      ? `${identity.name} — powered by PROMPT EDU ERP, a product of Prompt Innovations.`
      : "PROMPT EDU ERP — Technology with Purpose. A product of Prompt Innovations.",
    start_url: identity.startUrl,
    scope: identity.scope,
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#4f46e5",
    icons: identity.dynamicIcon
      ? [
          { src: `${identity.assetBasePath}/icon-badge/192`, sizes: "192x192", type: "image/png" },
          { src: `${identity.assetBasePath}/icon-badge/512`, sizes: "512x512", type: "image/png" },
        ]
      : [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
