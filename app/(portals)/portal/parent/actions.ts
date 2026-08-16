"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { getOwnParentId, isOwnChild } from "../../../../modules/portal/service";
import { applyForLeave } from "../../../../modules/attendance/service";

/** §D.6 follow-up "for parents log in they need to have an option for
 *  apply for leave" — resolves the caller's OWN parentId server-side and
 *  verifies the target child genuinely belongs to them (isOwnChild(), same
 *  §Z portal identity rule every other parent-portal read/write in this
 *  codebase follows) before ever calling applyForLeave() — a parent can
 *  never apply leave for a child that isn't their own, even by guessing a
 *  studentId. */
export async function applyLeaveForChildAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "attendance.leave.apply");
    const ownParentId = await getOwnParentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownParentId) return { error: "Your account isn't linked to a parent/guardian record yet." };
    const isOwn = await isOwnChild(ctx.institutionId, ctx.session.authUserId, ownParentId, studentId);
    if (!isOwn) return { error: "You can only apply for leave for your own child." };

    await applyForLeave(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      applicantType: "student",
      applicantId: studentId,
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath("/portal/parent");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit leave application." };
  }
}
