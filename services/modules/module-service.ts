/**
 * PROMPT EDU ERP — ModuleService (§I "module configuration", §W Super Admin
 * per-institution controls). `modules` (the platform-wide catalog) and
 * `institution_modules` (per-institution enable/disable state) both already
 * existed in migration 0001_foundation.sql — this file is the first thing
 * that actually reads/writes them; until now every institution silently
 * behaved as "everything enabled" with no way for a Super Admin to change
 * that per tenant.
 *
 * Default-enabled semantics: an institution with NO institution_modules row
 * for a given module is treated as that module being ENABLED (matching
 * institution_modules.is_enabled's own column default of `true`) — a Super
 * Admin only ever needs to write a row to turn something OFF for a specific
 * institution, not to explicitly turn everything on for every institution
 * that's never been touched. is_core modules (today: academic, students)
 * can never be disabled — every institution needs its own class/section/
 * subject/student structure to function at all, so this is enforced
 * server-side here, not just hidden in the UI.
 */
import { z } from "zod";
import { redirect } from "next/navigation";
import { getDbClient } from "../db/client";
import type { DbClient } from "../db/client";
import { resolveUserByAuthId } from "../tenant/tenant-service";
import { recordPlatformAudit } from "../audit/audit-service";

export interface ModuleCatalogEntry {
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  isCore: boolean;
}

export interface ModuleStatus extends ModuleCatalogEntry {
  isEnabled: boolean;
}

async function withSuperAdminContext<T>(authUserId: string, fn: (scoped: DbClient, callerUserId: string) => Promise<T>): Promise<T> {
  const resolved = await resolveUserByAuthId(authUserId);
  if (!resolved || !resolved.isSuperAdmin) {
    throw new Error("Forbidden: this action requires the platform Super Admin role.");
  }
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: null, authUserId, isSuperAdmin: true }, (scoped) => fn(scoped, resolved.userId));
}

/** Super Admin: every catalog module plus this institution's current enabled state. */
export async function listInstitutionModuleStatus(authUserId: string, institutionId: string): Promise<ModuleStatus[]> {
  return withSuperAdminContext(authUserId, async (scoped) => {
    const { rows } = await scoped.query<{
      code: string; name: string; description: string | null; category: string | null;
      is_core: boolean; is_enabled: boolean | null;
    }>(
      `select m.code, m.name, m.description, m.category, m.is_core, im.is_enabled
         from modules m
         left join institution_modules im on im.module_id = m.id and im.institution_id = $1
        where m.is_active = true
        order by m.is_core desc, m.category, m.name`,
      [institutionId]
    );
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      category: r.category,
      isCore: r.is_core,
      isEnabled: r.is_core || r.is_enabled !== false, // no row = enabled by default
    }));
  });
}

const setModuleSchema = z.object({ moduleCode: z.string().min(1), enabled: z.boolean() });

/** Super Admin: turn a module on/off for one institution. Rejects attempts to disable a core module. */
export async function setInstitutionModuleEnabled(
  authUserId: string,
  institutionId: string,
  input: z.infer<typeof setModuleSchema>
): Promise<void> {
  const data = setModuleSchema.parse(input);
  return withSuperAdminContext(authUserId, async (scoped, callerUserId) => {
    const { rows: moduleRows } = await scoped.query<{ id: string; is_core: boolean }>(
      "select id, is_core from modules where code = $1",
      [data.moduleCode]
    );
    if (moduleRows.length === 0) throw new Error(`Unknown module "${data.moduleCode}".`);
    const mod = moduleRows[0];
    if (mod.is_core && !data.enabled) {
      throw new Error(`"${data.moduleCode}" is a core module and cannot be disabled.`);
    }

    const { rows: before } = await scoped.query<{ is_enabled: boolean }>(
      "select is_enabled from institution_modules where institution_id = $1 and module_id = $2",
      [institutionId, mod.id]
    );

    await scoped.query(
      `insert into institution_modules (institution_id, module_id, is_enabled, enabled_by)
       values ($1, $2, $3, $4)
       on conflict (institution_id, module_id)
       do update set is_enabled = excluded.is_enabled, enabled_at = now(), enabled_by = excluded.enabled_by`,
      [institutionId, mod.id, data.enabled, callerUserId]
    );

    await recordPlatformAudit(scoped, {
      actorUserId: callerUserId, institutionId, action: data.enabled ? "module_enable" : "module_disable",
      entityType: "institution_modules", entityId: mod.id,
      before: { isEnabled: before[0]?.is_enabled ?? true }, after: { isEnabled: data.enabled },
    });
  });
}

/** Institution-scoped: the set of module codes currently enabled for this institution (core modules always included). */
export async function getEnabledModuleCodes(institutionId: string, authUserId: string): Promise<Set<string>> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ code: string; is_core: boolean; is_enabled: boolean | null }>(
      `select m.code, m.is_core, im.is_enabled
         from modules m
         left join institution_modules im on im.module_id = m.id and im.institution_id = $1
        where m.is_active = true`,
      [institutionId]
    );
    const enabled = new Set<string>();
    for (const r of rows) {
      if (r.is_core || r.is_enabled !== false) enabled.add(r.code);
    }
    return enabled;
  });
}

/** Page-level guard for optional-module pages (§Z-style defense in depth, mirroring
 *  resolveInstitutionBlockedReason's pattern) — throws a recognizable error the page
 *  can catch and redirect on. Not needed for is_core modules (academic, students),
 *  which can never be disabled. */
export async function requireModuleEnabled(institutionId: string, authUserId: string, moduleCode: string): Promise<void> {
  const enabled = await getEnabledModuleCodes(institutionId, authUserId);
  if (!enabled.has(moduleCode)) {
    throw new Error(`MODULE_DISABLED:${moduleCode}`);
  }
}

/** Same check as requireModuleEnabled(), but redirects straight to
 *  /module-unavailable itself instead of making every page implement its own
 *  try/catch — this is the one every (institution) optional-module page
 *  actually calls, one line at the top, right after resolving ctx. */
export async function requireModuleEnabledOrRedirect(institutionId: string, authUserId: string, moduleCode: string): Promise<void> {
  try {
    await requireModuleEnabled(institutionId, authUserId, moduleCode);
  } catch {
    redirect(`/module-unavailable?module=${encodeURIComponent(moduleCode)}`);
  }
}
