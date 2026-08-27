/**
 * PROMPT EDU ERP — Institution-level settings reads (§I "module configuration")
 * and self-service branding: logo (§263) and, since migration 0040, a
 * curated colour-combination palette ("never use dark ... give colour
 * combination options, let them choose best for them" follow-up — see
 * services/branding/palettes.ts for the full palette catalogue and the
 * rationale for storing an id rather than a raw hex).
 */
import { z } from "zod";
import { getDbClient } from "../db/client";
import { recordAudit } from "../audit/audit-service";
import { PALETTE_IDS } from "../branding/palettes";

export interface InstitutionSummary {
  id: string;
  code: string;
  name: string;
  appName: string | null;
  /** Palette id (services/branding/palettes.ts), or null → platform default. */
  themePalette: string | null;
  logoFileId: string | null;
  // Result Analysis & Reporting spec — tenant-wide default pass percentage
  // (institutions.pass_pct, migration 0038). NOT part of grade_bands; a
  // grade label is purely descriptive, pass/fail is this separate rule.
  // Per-subject overrides live on exam_subjects.pass_marks instead.
  passPct: number;
}

export async function getInstitution(institutionId: string, authUserId: string): Promise<InstitutionSummary | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{
      id: string; code: string; name: string; app_name: string | null; theme_palette: string | null; logo_file_id: string | null; pass_pct: string;
    }>(
      "select id, code, name, app_name, theme_palette, logo_file_id, pass_pct from institutions where id = $1",
      [institutionId]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      code: rows[0].code,
      name: rows[0].name,
      appName: rows[0].app_name,
      themePalette: rows[0].theme_palette,
      logoFileId: rows[0].logo_file_id,
      passPct: Number(rows[0].pass_pct),
    };
  });
}

const updatePassPctSchema = z.object({ passPct: z.number().min(0).max(100) });

/** Self-service write for the tenant-wide default pass percentage — same
 *  institutions_update_self RLS policy / settings.manage permission gate
 *  as updateInstitutionBranding() above. A curriculum preset
 *  (provisionGradingPreset(), services/super-admin/super-admin-service.ts)
 *  sets this automatically at onboarding; this is how an admin changes it
 *  afterward, or sets it at all for a fully custom scale that never went
 *  through a preset. */
export async function updateInstitutionPassPct(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof updatePassPctSchema>
): Promise<void> {
  const data = updatePassPctSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ pass_pct: string }>(
      "select pass_pct from institutions where id = $1", [institutionId]
    );
    await scoped.query("update institutions set pass_pct = $1, updated_at = now() where id = $2", [data.passPct, institutionId]);
    await recordAudit(scoped, {
      institutionId, userId, action: "update", module: "platform", entityType: "institutions", entityId: institutionId,
      before: { passPct: before[0] ? Number(before[0].pass_pct) : null }, after: { passPct: data.passPct },
    });
  });
}

export interface InstitutionPublicSummary {
  code: string;
  name: string;
  appName: string | null;
  /** Whether a logo has been uploaded — never the raw file id itself (no
   *  reason to hand a pre-auth caller anything more than "should I render
   *  an <img src="/api/institution-logo/<code>">"). */
  hasLogo: boolean;
  /** Palette id (services/branding/palettes.ts), or null → platform
   *  default. Deliberately exposed pre-auth — the same cosmetic choice is
   *  already visible on this institution's own public /<code> URL, so
   *  there is nothing sensitive about it, unlike status/deployment_mode
   *  (still never exposed here). Lets the /login screen for THIS
   *  institution render in the institution's own chosen colours before
   *  anyone has signed in. */
  themePalette: string | null;
}

/**
 * Intentionally-public, pre-authentication lookup (§137 follow-up: "it
 * should show an interface to login to mmp") — used only by
 * app/(auth)/login/page.tsx to show which institution's login screen a
 * visitor is on, from the active-institution cookie middleware.ts already
 * set from their /<code> URL, before they've signed in at all. There is no
 * signed-in user yet to run `getInstitution()`'s ordinary
 * withInstitutionContext(institutionId, authUserId) RLS check as, so this
 * runs with an explicit `isSuperAdmin: true` DB context instead — NOT
 * because the caller is a Super Admin, but because that is the only
 * context the RLS policy on `institutions` (§E) grants unrestricted SELECT
 * to, and this function is the one deliberately-narrow, deliberately-safe
 * place in the codebase that uses it that way. Kept safe by what it
 * returns, not by who's asking: a handful of non-sensitive columns
 * (code/name/app_name/theme_palette) — the same code, display name, and
 * colour choice already shown un-authenticated in that institution's own
 * shareable URL and on its Super Admin listing row. Never exposes status,
 * deployment_mode, or anything else on the row. A code that doesn't match
 * any institution returns null — the login page just falls back to
 * generic branding, exactly as if no institution cookie were set at all.
 */
export async function getInstitutionPublicSummaryByCode(code: string): Promise<InstitutionPublicSummary | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: null, isSuperAdmin: true }, async (scoped) => {
    const { rows } = await scoped.query<{ code: string; name: string; app_name: string | null; logo_file_id: string | null; theme_palette: string | null }>(
      "select code, name, app_name, logo_file_id, theme_palette from institutions where code = $1",
      [code]
    );
    if (!rows[0]) return null;
    return {
      code: rows[0].code,
      name: rows[0].name,
      appName: rows[0].app_name,
      hasLogo: rows[0].logo_file_id !== null,
      themePalette: rows[0].theme_palette,
    };
  });
}

export interface PublicLogoFile {
  storageProvider: "local" | "supabase";
  storageFileId: string;
  mimeType: string | null;
  fileName: string;
}

/**
 * Pre-authentication logo lookup for GET /api/institution-logo/[code] (the
 * one place this app genuinely needs to serve a file's bytes to someone who
 * hasn't signed in yet — the login page's brand panel). Same
 * `isSuperAdmin: true` DB-context pattern as getInstitutionPublicSummaryByCode()
 * above, for the same reason (no session to run withInstitutionContext's
 * ordinary institutionId/authUserId RLS check against) — but scoped much more
 * tightly than "any column on this row": the query only ever returns a file
 * that is (a) this exact institution's own logo_file_id, AND (b) tagged
 * entity_type = 'institution_logo', AND (c) explicitly is_public = true, so
 * even a future bug that pointed logo_file_id at some other file would still
 * refuse to serve it here unless every one of those three conditions holds
 * — plus a fourth, f.institution_id = i.id, the same belt-and-braces
 * ownership check updateInstitutionLogo() enforces at write time.
 */
export async function getPublicLogoFile(institutionCode: string): Promise<PublicLogoFile | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: null, isSuperAdmin: true }, async (scoped) => {
    const { rows } = await scoped.query<{
      storage_provider: string; storage_file_id: string; mime_type: string | null; file_name: string;
    }>(
      `select f.storage_provider, f.storage_file_id, f.mime_type, f.file_name
         from institutions i
         join files f on f.id = i.logo_file_id and f.institution_id = i.id
        where i.code = $1
          and f.entity_type = 'institution_logo'
          and f.is_public = true`,
      [institutionCode]
    );
    if (!rows[0]) return null;
    return {
      storageProvider: rows[0].storage_provider as "local" | "supabase",
      storageFileId: rows[0].storage_file_id,
      mimeType: rows[0].mime_type,
      fileName: rows[0].file_name,
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

const updateThemeSchema = z.object({
  // null explicitly means "reset to the platform default" — distinct from
  // omitting the field, which zod would otherwise treat as "leave
  // unchanged" if this were a partial update; here it's always a full
  // replace, so null is a real, meaningful value, not an absence.
  themePalette: z.enum(PALETTE_IDS as [string, ...string[]]).nullable(),
});

/**
 * Institution-scoped self-service write (§137, evolved by migration 0040
 * into whole-palette choice rather than a raw hex — see
 * services/branding/palettes.ts) — the one function in this codebase that
 * runs an UPDATE on `institutions` WITHOUT withSuperAdminContext, made
 * possible by migration 0020's narrow institutions_update_self RLS policy
 * (institution_id equality only, same as every other tenant-owned table —
 * see that migration's own comment for the full rationale). Only reachable
 * through app/(institution)/settings/actions.ts, gated on the
 * settings.manage permission at the action layer, same defense-in-depth
 * split as everywhere else in this codebase.
 */
export async function updateInstitutionTheme(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof updateThemeSchema>
): Promise<void> {
  const data = updateThemeSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ theme_palette: string | null }>(
      "select theme_palette from institutions where id = $1",
      [institutionId]
    );
    await scoped.query(
      "update institutions set theme_palette = $1, updated_at = now() where id = $2",
      [data.themePalette, institutionId]
    );
    await recordAudit(scoped, {
      institutionId,
      userId,
      action: "update",
      module: "platform",
      entityType: "institutions",
      entityId: institutionId,
      before: { themePalette: before[0]?.theme_palette ?? null },
      after: { themePalette: data.themePalette },
    });
  });
}

/**
 * Institution-scoped self-service write for the logo — same
 * institutions_update_self RLS policy / settings.manage permission gate as
 * updateInstitutionBranding() above. The actual file upload happens through
 * FileService.uploadFile() first (in the calling server action); this
 * function only ever points institutions.logo_file_id at an already-uploaded
 * file (or null, to remove it) — it never touches file bytes itself.
 *
 * fileId is NOT trusted blindly, and — unlike this doc comment's first draft
 * assumed — files' own RLS does NOT automatically protect this write on its
 * own: `institutions.logo_file_id references files(id)`, and Postgres FK
 * constraint checks run against the underlying table directly, bypassing
 * RLS the same way migrate.ts's own comment notes table owners/superusers
 * do — an ordinary UPDATE naming an arbitrary existing file id would
 * satisfy the FK regardless of which institution that file actually
 * belongs to. So this function explicitly re-SELECTs the file under THIS
 * institutionId/authUserId's own scoped context first — files' RLS (migration
 * 0018's tenant_isolation_select policy) genuinely does filter that
 * ordinary SELECT, so a file belonging to a different institution comes
 * back as zero rows and the write is refused before it ever reaches the
 * UPDATE statement.
 */
export async function updateInstitutionLogo(
  institutionId: string,
  authUserId: string,
  userId: string,
  logoFileId: string | null
): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    if (logoFileId) {
      const { rows: owned } = await scoped.query<{ id: string }>("select id from files where id = $1", [logoFileId]);
      if (owned.length === 0) {
        throw new Error("That file does not belong to this institution — refusing to set it as the logo.");
      }
    }
    const { rows: before } = await scoped.query<{ logo_file_id: string | null }>(
      "select logo_file_id from institutions where id = $1",
      [institutionId]
    );
    await scoped.query(
      "update institutions set logo_file_id = $1, updated_at = now() where id = $2",
      [logoFileId, institutionId]
    );
    await recordAudit(scoped, {
      institutionId,
      userId,
      action: "update",
      module: "platform",
      entityType: "institutions",
      entityId: institutionId,
      before: { logoFileId: before[0]?.logo_file_id ?? null },
      after: { logoFileId },
    });
  });
}

// -----------------------------------------------------------------------------
// Parent portal section visibility (§Page-3 follow-up "Student Portfolio
// Management — designing children's page, what should be shown in the
// Parent portal") — a single jsonb config blob (migration 0032) an admin
// toggles in Settings; the parent-facing child page (app/(portals)/portal/
// parent/page.tsx) reads it to decide which sections to render. Defaults to
// every section visible, so existing institutions see no behavior change
// until an admin deliberately hides something.
// -----------------------------------------------------------------------------

export const PARENT_PORTAL_SECTION_KEYS = [
  "results", "attendance", "discipline", "achievements", "library", "skills", "portfolio",
  "character", "mentoring",
] as const;
export type ParentPortalSectionKey = (typeof PARENT_PORTAL_SECTION_KEYS)[number];
export type ParentPortalSections = Record<ParentPortalSectionKey, boolean>;

const DEFAULT_PARENT_PORTAL_SECTIONS: ParentPortalSections = {
  results: true, attendance: true, discipline: true, achievements: true, library: true, skills: true, portfolio: true,
  character: true, mentoring: true,
};

export async function getParentPortalSections(institutionId: string, authUserId: string): Promise<ParentPortalSections> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ parent_portal_sections: ParentPortalSections }>(
      "select parent_portal_sections from institutions where id = $1",
      [institutionId]
    );
    return { ...DEFAULT_PARENT_PORTAL_SECTIONS, ...(rows[0]?.parent_portal_sections ?? {}) };
  });
}

export async function updateParentPortalSections(
  institutionId: string, authUserId: string, userId: string, sections: ParentPortalSections
): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      "update institutions set parent_portal_sections = $1::jsonb, updated_at = now() where id = $2",
      [JSON.stringify(sections), institutionId]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "update", module: "platform",
      entityType: "institutions", entityId: institutionId, after: { parentPortalSections: sections },
    });
  });
}
