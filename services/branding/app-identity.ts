/**
 * PROMPT EDU ERP — one shared "who is this app, right now" resolver, used by
 * the PWA manifest (app/manifest.ts), the dynamic install-icon route
 * (app/icon-badge/[size]/route.tsx), and app/layout.tsx's favicon/
 * apple-touch-icon metadata, so the name/short_name/icon/identity can never
 * drift apart between them.
 *
 * Follow-up fix ("I can't download different apps separately"): every
 * institution's manifest shared the same `scope`/`start_url` ("/"), which
 * is how a browser decides whether an install is a NEW app or just an
 * update to one already installed — same scope + same start_url on the
 * same origin means "same app" to Chrome/Edge/etc, no matter how different
 * the name/icon look, so a second institution's "Install" simply
 * overwrote the first one's home-screen entry instead of adding a second.
 * Two independent fixes now stack:
 *   1. The Web App Manifest spec's `id` member exists specifically for
 *      "same origin, several independently-installable apps" — each
 *      identity gets its own `appId` (→ manifest `id`).
 *   2. middleware.ts now gives each institution a REAL, distinct URL
 *      prefix (/<code>/...), so `scope`/`startUrl` below can be genuinely
 *      different per identity too — not just an `id` field and a
 *      belt-and-braces query string, but an actually-different, properly
 *      scoped install target, which is both more correct per spec and a
 *      second, independent signal for browsers that don't yet support
 *      `id`.
 */
import { getInstitution, getInstitutionPublicSummaryByCode } from "../institution/institution-service";
import { getPlatformDefaultPalette } from "../super-admin/super-admin-service";
import { getPalette } from "./palettes";
import type { RequestContext } from "../../types/context";

export interface AppIdentity {
  name: string;
  /** Short label for manifest.json's `short_name` (Android app-drawer text). */
  shortName: string;
  /** Even shorter label rendered inside the square icon graphic itself. */
  badgeText: string;
  /** false → caller should use the static /icons/icon-*.png files instead. */
  dynamicIcon: boolean;
  /** Unique per identity → manifest.json's `id` (the actual "is this a
   *  different installable app" key, per the Web App Manifest spec). */
  appId: string;
  /** manifest.json's `scope` — what part of the site counts as "this app".
   *  Real, distinct per institution now that middleware.ts routes
   *  /<code>/... as its own URL prefix. */
  scope: string;
  /** manifest.json's `start_url` — always inside `scope` above. */
  startUrl: string;
  /** §137 follow-up ("still not able to download different apps
   *  separately") — root cause found: app/layout.tsx's <link rel=
   *  "manifest"> and the icon <link>/<meta> tags all pointed at the exact
   *  same literal URLs ("/manifest.webmanifest", "/icon-badge/192") for
   *  EVERY institution. `scope`/`start_url`/`id` differing INSIDE the
   *  manifest body was real progress (§172/173) but browsers' install
   *  pipelines key "have I already seen this manifest/icon" heavily off
   *  the REQUEST URL itself, not just its parsed content — a shared URL
   *  serving different JSON per request is exactly the pattern that made
   *  Chrome/Android treat a second institution's install as "update the
   *  one I already have" rather than "here's a new app", and (worse) let
   *  the icon-badge route's `Cache-Control: public, max-age=3600` serve
   *  one institution's cached icon PNG to another's install attempt.
   *  `assetBasePath` is prepended to every manifest/icon URL below so each
   *  institution gets a genuinely distinct, independently-cacheable URL
   *  (middleware.ts's existing /<code>/<rest> rewrite handles the
   *  routing — no new route files needed, just different URLs pointing at
   *  the same handlers). Empty string for the generic/no-institution case,
   *  where there's nothing institution-specific to keep separate anyway. */
  assetBasePath: string;
  /** "Can I add institution logo?" follow-up — set once the institution has
   *  actually uploaded a logo (institutions.logo_file_id is non-null);
   *  app/icon-badge/[size]/route.tsx streams that real image instead of the
   *  generated letter-gradient badge when this is set. Always null for the
   *  generic/Super-Admin identities — neither has an uploadable logo. */
  logoInstitutionCode: string | null;
  /** "Never use app icon in black" follow-up — the generated letter-badge
   *  (app/icon-badge/[size]/route.tsx, when there's no uploaded logo) is
   *  rendered as a gradient across these three stops instead of a fixed
   *  colour, taken from this identity's resolved palette (the
   *  institution's own choice, or the platform default) — never black,
   *  never hardcoded. */
  badgeGradient: [string, string, string];
}

function genericIdentity(gradient: [string, string, string]): AppIdentity {
  return {
    name: "PROMPT EDU ERP",
    shortName: "PROMPT",
    badgeText: "P",
    dynamicIcon: false,
    appId: "/app/platform",
    scope: "/",
    startUrl: "/",
    assetBasePath: "",
    logoInstitutionCode: null,
    badgeGradient: gradient,
  };
}

async function resolveBadgeGradient(themePalette: string | null): Promise<[string, string, string]> {
  const palette = getPalette(themePalette ?? (await getPlatformDefaultPalette()));
  return [palette.vars.brandFrom, palette.vars.brandVia, palette.vars.brandTo];
}

export async function resolveAppIdentity(ctx: RequestContext | null): Promise<AppIdentity> {
  if (ctx?.institutionId) {
    const institution = await getInstitution(ctx.institutionId, ctx.session.authUserId).catch(() => null);
    if (institution) {
      const name = institution.appName || institution.name;
      const code = institution.code?.trim();
      const label = code ? code.toUpperCase() : name.trim().charAt(0).toUpperCase();
      const slug = (code || institution.id).toLowerCase();
      return {
        name,
        shortName: label.length > 12 ? label.slice(0, 12) : label,
        badgeText: label,
        dynamicIcon: true,
        appId: `/app/${slug}`,
        scope: `/${slug}/`,
        startUrl: `/${slug}`,
        assetBasePath: `/${slug}`,
        logoInstitutionCode: institution.logoFileId && code ? code : null,
        badgeGradient: await resolveBadgeGradient(institution.themePalette),
      };
    }
  }
  if (ctx?.isSuperAdmin) {
    // No /<code>/<rest> rewrite exists for "super-admin" (it's a reserved
    // top-level route, not an institution code) — left on the shared
    // manifest/icon URLs. Not a multi-tenancy concern the way institutions
    // are: there is only ever one Super Admin console to install.
    return {
      name: "Super Admin Console",
      shortName: "ADMIN",
      badgeText: "SA",
      dynamicIcon: true,
      appId: "/app/super-admin",
      scope: "/super-admin/",
      startUrl: "/super-admin",
      assetBasePath: "",
      logoInstitutionCode: null,
      badgeGradient: await resolveBadgeGradient(null),
    };
  }
  return genericIdentity(await resolveBadgeGradient(null));
}

/**
 * Follow-up ("Install still offers PROMPT EDU ERP, not the institute's own
 * app" -- confirmed via live testing that resolveAppIdentity(ctx) above
 * genuinely returns the right institution for an authenticated fetch, yet
 * the browser's own native install prompt still showed generic branding).
 * Root cause: resolveAppIdentity(ctx) requires a signed-in session
 * (getRequestContext() returns null with no session at all) -- but the
 * fetches a browser's OWN internal installability/manifest engine makes to
 * evaluate `beforeinstallprompt` are not guaranteed to carry the same
 * session cookies a same-origin page fetch does (long-standing, still
 * inconsistent Chromium behavior for manifest/icon requests specifically).
 * app/manifest.webmanifest/route.ts and app/icon-badge/[size]/route.tsx
 * both need identity that's correct EVEN when nothing in the request looks
 * authenticated -- so this variant resolves purely from the institution
 * CODE already sitting in the URL (middleware.ts's /<code>/... rewrite
 * forwards it via the `x-institution-code` request header), using the
 * same intentionally-public, pre-auth lookup the /login page already uses
 * (getInstitutionPublicSummaryByCode, §137 follow-up) -- no session, no
 * cookie, no institution membership required, exactly matching what a
 * PWA manifest needs to be fetchable/correct for anyone, logged in or not.
 */
export async function resolveAppIdentityByCode(code: string | null): Promise<AppIdentity> {
  if (!code) return genericIdentity(await resolveBadgeGradient(null));
  const institution = await getInstitutionPublicSummaryByCode(code).catch(() => null);
  if (!institution) return genericIdentity(await resolveBadgeGradient(null));
  const name = institution.appName || institution.name;
  const trimmedCode = institution.code.trim();
  const label = trimmedCode ? trimmedCode.toUpperCase() : name.trim().charAt(0).toUpperCase();
  const slug = trimmedCode.toLowerCase();
  return {
    name,
    shortName: label.length > 12 ? label.slice(0, 12) : label,
    badgeText: label,
    dynamicIcon: true,
    appId: `/app/${slug}`,
    scope: `/${slug}/`,
    startUrl: `/${slug}`,
    assetBasePath: `/${slug}`,
    logoInstitutionCode: institution.hasLogo ? trimmedCode : null,
    badgeGradient: await resolveBadgeGradient(institution.themePalette),
  };
}
