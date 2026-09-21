"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { computeConsolidatedScore, computeStarOfTheMonth, announceStarOfTheMonth } from "../../../modules/scoring/service";
import { startOfMonthIST } from "../../../services/datetime/ist";

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

/** §9 "Star of the Month" -- institution-wide (every enrolled student, one
 *  winner per stage), so gated on settings.manage rather than the
 *  lighter-weight reports.view the single-student compute above uses.
 *  Only writes a draft -- nothing public changes until an admin calls
 *  announceStarOfTheMonthAction below, so this only revalidates /scoring. */
export async function computeStarOfTheMonthAction(_prevState: { error: string | null; message?: string | null }, _formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const winners = await computeStarOfTheMonth(ctx.institutionId, ctx.session.authUserId, ctx.userId, startOfMonthIST());
    revalidatePath("/scoring");
    if (winners.length === 0) {
      return { error: "No default performance profile, or no enrolled students -- nothing to compute yet." };
    }
    return { error: null, message: `${winners.length} winner(s) computed as a draft -- review below, then announce when ready.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to compute Star of the Month." };
  }
}

/** §9 follow-up: "will be announced by the institution admin after
 *  verification once it is ready -- do not do it automatically." Publishes
 *  a computed (draft) month's winners to everyone's-login banner. Expects
 *  a "monthStart" field in formData (one Announce button per draft row in
 *  the history table on the Scoring page). */
export async function announceStarOfTheMonthAction(_prevState: { error: string | null; message?: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const monthStart = String(formData.get("monthStart") ?? "");
    if (!monthStart) return { error: "Missing month." };
    const count = await announceStarOfTheMonth(ctx.institutionId, ctx.session.authUserId, ctx.userId, monthStart);
    revalidatePath("/scoring");
    revalidatePath("/dashboard");
    revalidatePath("/portal/student");
    revalidatePath("/portal/parent");
    if (count === 0) return { error: "Nothing to announce for that month (already announced, or not computed yet)." };
    return { error: null, message: `Announced -- now visible in everyone's login banner.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to announce Star of the Month." };
  }
}
