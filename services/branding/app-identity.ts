/**
 * PROMPT EDU ERP — one shared "who is this app, right now" resolver, used by
 * both the PWA manifest (app/manifest.ts) and the dynamic install-icon
 * route (app/icon-badge/[size]/route.tsx) so the badge text and the
 * name/short_name text can never drift apart.
 *
 * Follow-up to "separate apps for each institution ... install as an app
 * ... in that name": an installed app's home-screen ICON, not just its
 * name, was still the one shared generic "P" graphic for every institution
 * (and for the Super Admin console) — this resolves a short, distinctive
 * monogram per context instead:
 *   - a real institution session → its own short code (e.g. "KEMHS")
 *   - a pure Super Admin session (no active institution)   → "SA"
 *   - no session / no institution (e.g. the public /login page reached
 *     without visiting an institution's /<code> URL first) → falls back to
 *     the one static shared icon file (dynamicIcon: false) — there's
 *     nothing institution-specific to show yet.
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
}

const GENERIC: AppIdentity = {
  name: "PROMPT EDU ERP",
  shortName: "PROMPT",
  badgeText: "P",
  dynamicIcon: false,
};

export async function resolveAppIdentity(ctx: RequestContext | null): Promise<AppIdentity> {
  if (ctx?.institutionId) {
    const institution = await getInstitution(ctx.institutionId, ctx.session.authUserId).catch(() => null);
    if (institution) {
      const name = institution.appName || institution.name;
      const code = institution.code?.trim();
      const label = code ? code.toUpperCase() : name.trim().charAt(0).toUpperCase();
      return { name, shortName: label.length > 12 ? label.slice(0, 12) : label, badgeText: label, dynamicIcon: true };
    }
  }
  if (ctx?.isSuperAdmin) {
    return { name: "Super Admin Console", shortName: "ADMIN", badgeText: "SA", dynamicIcon: true };
  }
  return GENERIC;
}
