"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createDisciplineRecord, recordDisciplineFollowUp, recordCharacterAssessment,
} from "../../../modules/discipline/service";

export async function createDisciplineRecordAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "discipline.record");
    await createDisciplineRecord(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: String(formData.get("studentId") ?? ""),
      categoryId: String(formData.get("categoryId") ?? ""),
      date: String(formData.get("date") ?? ""),
      description: String(formData.get("description") ?? "") || null,
    });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record discipline entry." };
  }
}

export async function recordDisciplineFollowUpAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "discipline.record");
    await recordDisciplineFollowUp(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("disciplineRecordId") ?? ""), {
      followUpNotes: String(formData.get("followUpNotes") ?? ""),
    });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save follow-up." };
  }
}

export async function recordCharacterAssessmentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "discipline.record");
    await recordCharacterAssessment(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: String(formData.get("studentId") ?? ""),
      attributeId: String(formData.get("attributeId") ?? ""),
      period: String(formData.get("period") ?? ""),
      rating: Number(formData.get("rating") ?? 0),
      notes: String(formData.get("notes") ?? "") || null,
    });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record character assessment." };
  }
}
