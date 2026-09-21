"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { computeConsolidatedScore, computeStarOfTheWeek } from "../../../modules/scoring/service";
import { startOfWeekIST } from "../../../services/datetime/ist";

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

/** §9 "Star of the Week" -- institution-wide (every enrolled student, one
 *  winner per stage), so gated on settings.manage rather than the
 *  lighter-weight reports.view the single-student compute above uses. */
export async function computeStarOfTheWeekAction(_prevState: { error: string | null; message?: string | null }, _formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const winners = await computeStarOfTheWeek(ctx.institutionId, ctx.session.authUserId, ctx.userId, startOfWeekIST());
    revalidatePath("/scoring");
    revalidatePath("/dashboard");
    revalidatePath("/portal/student");
    revalidatePath("/portal/parent");
    if (winners.length === 0) {
      return { error: "No default performance profile, or no enrolled students -- nothing to compute yet." };
    }
    return { error: null, message: `${winners.length} winner(s) selected for this week.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to compute Star of the Week." };
  }
}
