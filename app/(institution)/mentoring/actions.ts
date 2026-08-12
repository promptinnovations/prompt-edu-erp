"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { createMentoringRecord, updateMentoringRecord, getOwnStaffId } from "../../../modules/mentoring/service";

export async function createMentoringRecordAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "mentoring.create");
    await createMentoringRecord(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: String(formData.get("studentId") ?? ""),
      date: String(formData.get("date") ?? ""),
      academicObservation: String(formData.get("academicObservation") ?? "") || null,
      behaviourObservation: String(formData.get("behaviourObservation") ?? "") || null,
      strengths: String(formData.get("strengths") ?? "") || null,
      challenges: String(formData.get("challenges") ?? "") || null,
      goals: String(formData.get("goals") ?? "") || null,
      actionPlan: String(formData.get("actionPlan") ?? "") || null,
      followUpDate: String(formData.get("followUpDate") ?? "") || null,
      confidentialityLevel: (String(formData.get("confidentialityLevel") ?? "standard")) as "standard" | "restricted",
    });
    revalidatePath("/mentoring");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save mentoring record." };
  }
}

export async function updateMentoringRecordAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "mentoring.create");
    const ownStaffId = await getOwnStaffId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    const result = await updateMentoringRecord(
      ctx.institutionId, ctx.session.authUserId, ctx.userId, ownStaffId,
      String(formData.get("mentoringRecordId") ?? ""),
      { goals: String(formData.get("goals") ?? "") || null, actionPlan: String(formData.get("actionPlan") ?? "") || null }
    );
    if (!result) return { error: "You can only edit mentoring records you authored." };
    revalidatePath("/mentoring");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update mentoring record." };
  }
}
