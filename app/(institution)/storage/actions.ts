"use server";

import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { migrateInstitutionFiles } from "../../../services/storage/migration-job";
import type { MigrationResult } from "../../../services/storage/migration-job";

export interface MigrateActionState {
  result: MigrationResult | null;
  error: string | null;
}

export async function migrateStorageAction(_prevState: MigrateActionState, formData: FormData): Promise<MigrateActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { result: null, error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "files.manage");
    const target = String(formData.get("targetProvider") ?? "");
    if (target !== "local" && target !== "supabase") {
      return { result: null, error: "Choose a valid target provider." };
    }
    const result = await migrateInstitutionFiles(ctx.institutionId, ctx.session.authUserId, ctx.userId, target);
    return { result, error: null };
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : "Migration failed." };
  }
}
