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
import { getInstitution } from "../institution/institution-service";
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
}

const GENERIC: AppIdentity = {
  name: "PROMPT EDU ERP",
  shortName: "PROMPT",
  badgeText: "P",
  dynamicIcon: false,
  appId: "/app/platform",
  scope: "/",
  startUrl: "/",
};

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
      };
    }
  }
  if (ctx?.isSuperAdmin) {
    return {
      name: "Super Admin Console",
      shortName: "ADMIN",
      badgeText: "SA",
      dynamicIcon: true,
      appId: "/app/super-admin",
      scope: "/super-admin/",
      startUrl: "/super-admin",
    };
  }
  return GENERIC;
}
