"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { computeConsolidatedScore } from "../../../modules/scoring/service";

export async function computeConsolidatedScoreAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "reports.view");
    const studentId = String(formData.get("studentId") ?? "");
    const period = String(formData.get("period") ?? "");
    const fromDate = String(formData.get("fromDate") ?? "");
    const toDate = String(formData.get("toDate") ?? "");
    const result = await computeConsolidatedScore(ctx.institutionId, ctx.session.authUserId, studentId, period, fromDate, toDate);
    if (!result) return { error: "No default performance profile with components is configured for this institution." };
    revalidatePath("/scoring");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to compute consolidated score." };
  }
}
