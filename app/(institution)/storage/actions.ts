"use server";

import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { migrateInstitutionFiles } from "../../../services/storage/migration-job";
import type { MigrationResult } from "../../../services/storage/migration-job";
import { removeDriveConnection } from "../../../services/storage/institution-storage";
import { revalidatePath } from "next/cache";

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
    if (target !== "local" && target !== "supabase" && target !== "google_drive") {
      return { result: null, error: "Choose a valid target provider." };
    }
    const result = await migrateInstitutionFiles(ctx.institutionId, ctx.session.authUserId, ctx.userId, target);
    return { result, error: null };
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : "Migration failed." };
  }
}

/** Storage → Google Drive → Disconnect (only once no file is left there). */
export async function disconnectDriveAction(_prev: { error: string | null; ok?: string | null }, _fd: FormData): Promise<{ error: string | null; ok?: string | null }> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "files.manage");
    await removeDriveConnection(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    revalidatePath("/storage");
    return { error: null, ok: "Google Drive disconnected. New files go to the app's own storage." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not disconnect." };
  }
}
