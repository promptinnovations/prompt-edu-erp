"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { refreshAnalyticsViews, upsertClassificationRule } from "../../../modules/analytics/service";

export async function refreshAnalyticsAction(_prevState: { error: string | null }, _formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "reports.view");
    await refreshAnalyticsViews();
    revalidatePath("/analytics");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to refresh analytics." };
  }
}

export async function setClassificationRuleAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await upsertClassificationRule(ctx.institutionId, ctx.session.authUserId, {
      basedOn: "percentage",
      highThreshold: Number(formData.get("highThreshold") ?? 75),
      lowThreshold: Number(formData.get("lowThreshold") ?? 40),
    });
    revalidatePath("/analytics");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update classification rule." };
  }
}
