"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { stageImport, confirmImport, type StageResult, type ConfirmResult } from "../../../modules/bulk/service";

export interface ImportActionState {
  error: string | null;
  staged: StageResult | null;
  confirmed: ConfirmResult | null;
}

export async function stageImportAction(_prevState: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution.", staged: null, confirmed: null };
  try {
    requirePermission(ctx.permissions, "data.import");
    const entityType = String(formData.get("entityType") ?? "");
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { error: "Please choose a file to upload.", staged: null, confirmed: null };
    const format = file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const staged = await stageImport(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      entityType, filename: file.name, fileBuffer, format,
    });
    return { error: null, staged, confirmed: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to stage import.", staged: null, confirmed: null };
  }
}

export async function confirmImportAction(_prevState: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution.", staged: null, confirmed: null };
  try {
    requirePermission(ctx.permissions, "data.import");
    const batchId = String(formData.get("batchId") ?? "");
    const confirmed = await confirmImport(ctx.institutionId, ctx.session.authUserId, ctx.userId, batchId);
    revalidatePath("/import");
    return { error: null, staged: null, confirmed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to confirm import.", staged: null, confirmed: null };
  }
}
