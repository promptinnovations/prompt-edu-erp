/**
 * PROMPT EDU ERP — Institution-level settings reads (§I "module configuration")
 * and self-service branding (§137 follow-up: "options for changing colour
 * codes of the app according to their wish").
 */
import { z } from "zod";
import { getDbClient } from "../db/client";
import { recordAudit } from "../audit/audit-service";

export interface InstitutionSummary {
  id: string;
  code: string;
  name: string;
  appName: string | null;
  primaryColor: string | null;
}

/** The app's built-in look when an institution hasn't picked its own colour
 *  — the same shade every button/accent used before this feature existed
 *  (Tailwind's zinc-900), so institutions that never touch Settings see no
 *  visual change. */
export const DEFAULT_BRAND_COLOR = "#18181b";

export async function getInstitution(institutionId: string, authUserId: string): Promise<InstitutionSummary | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{
      id: string; code: string; name: string; app_name: string | null; primary_color: string | null;
    }>(
      "select id, code, name, app_name, primary_color from institutions where id = $1",
      [institutionId]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      code: rows[0].code,
      name: rows[0].name,
      appName: rows[0].app_name,
      primaryColor: rows[0].primary_color,
    };
  });
}

export async function getEnabledUiLanguages(institutionId: string, authUserId: string): Promise<string[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ value_jsonb: string[] }>(
      "select value_jsonb from institution_settings where institution_id = $1 and key = 'enabled_ui_languages'",
      [institutionId]
    );
    return rows[0]?.value_jsonb ?? ["en"]; // English-only default (§S.2)
  });
}

/** Clamps each RGB channel of `hex` towards black by `amount` (0–1) — used to
 *  derive a hover/pressed shade from a single admin-picked brand colour so
 *  Settings only needs to ask for one colour, not two. Pure/deterministic
 *  (no CSS color-mix() dependency, so it works identically in every browser
 *  and is trivially unit-testable) — see getBrandColors() below. */
export function darkenHex(hex: string, amount: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const channel = (shift: number) => {
    const v = (num >> shift) & 0xff;
    return Math.max(0, Math.round(v * (1 - amount)));
  };
  const r = channel(16);
  const g = channel(8);
  const b = channel(0);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** The two CSS custom-property values every (institution)/(portal) layout
 *  injects — brand for the resting colour, brandHover for its
 *  hover/pressed state. Falls back to DEFAULT_BRAND_COLOR (and its own
 *  derived hover shade) when the institution hasn't set one. */
export function getBrandColors(primaryColor: string | null): { brand: string; brandHover: string } {
  const brand = primaryColor && HEX_COLOR.test(primaryColor) ? primaryColor : DEFAULT_BRAND_COLOR;
  return { brand, brandHover: darkenHex(brand, 0.15) };
}

const updateBrandingSchema = z.object({
  // null explicitly means "reset to the app default" — distinct from
  // omitting the field, which zod would otherwise treat as "leave
  // unchanged" if this were a partial update; here it's always a full
  // replace, so null is a real, meaningful value, not an absence.
  primaryColor: z.string().regex(HEX_COLOR, "Must be a hex colour like #2563eb.").nullable(),
});

/**
 * Institution-scoped self-service write (§137) — the one function in this
 * codebase that runs an UPDATE on `institutions` WITHOUT
 * withSuperAdminContext, made possible by migration 0020's narrow
 * institutions_update_self RLS policy (institution_id equality only, same
 * as every other tenant-owned table — see that migration's own comment for
 * the full rationale). Only reachable through
 * app/(institution)/settings/actions.ts, gated on the settings.manage
 * permission at the action layer, same defense-in-depth split as
 * everywhere else in this codebase.
 */
export async function updateInstitutionBranding(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof updateBrandingSchema>
): Promise<void> {
  const data = updateBrandingSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ primary_color: string | null }>(
      "select primary_color from institutions where id = $1",
      [institutionId]
    );
    await scoped.query(
      "update institutions set primary_color = $1, updated_at = now() where id = $2",
      [data.primaryColor, institutionId]
    );
    await recordAudit(scoped, {
      institutionId,
      userId,
      action: "update",
      module: "platform",
      entityType: "institutions",
      entityId: institutionId,
      before: { primaryColor: before[0]?.primary_color ?? null },
      after: { primaryColor: data.primaryColor },
    });
  });
}
