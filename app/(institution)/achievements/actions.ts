"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { submitAchievement, verifyAchievement, approveAchievement, rejectAchievement } from "../../../modules/achievements/service";
import { uploadFile } from "../../../services/storage/file-service";

export async function submitAchievementAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "achievements.submit");

    // Certificate upload happens BEFORE the achievement row is created (its
    // own, separate transaction — see services/storage/file-service.ts's
    // uploadFile() doc comment on why an external network call is never
    // held open inside the same DB transaction as a row insert). If the
    // achievement insert below fails after a successful upload, the result
    // is one orphaned file row, not a corrupted achievement — an acceptable
    // and simple tradeoff matching this build's other upload-then-link flows.
    let certificateFileId: string | null = null;
    const certificate = formData.get("certificate");
    if (certificate instanceof File && certificate.size > 0) {
      const bytes = Buffer.from(await certificate.arrayBuffer());
      const uploaded = await uploadFile(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
        entityType: "achievements",
        entityId: null,
        fileName: certificate.name,
        mimeType: certificate.type,
        bytes,
      });
      certificateFileId = uploaded.id;
    }

    const points = formData.get("points");
    await submitAchievement(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: String(formData.get("studentId") ?? ""),
      categoryId: String(formData.get("categoryId") ?? ""),
      levelId: String(formData.get("levelId") ?? ""),
      title: String(formData.get("title") ?? ""),
      position: String(formData.get("position") ?? "") || null,
      points: points ? Number(points) : null,
      certificateFileId,
    });
    revalidatePath("/achievements");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit achievement." };
  }
}

export async function verifyAchievementAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const achievementId = String(formData.get("achievementId") ?? "");
  try {
    requirePermission(ctx.permissions, "achievements.verify");
    await verifyAchievement(ctx.institutionId, ctx.session.authUserId, ctx.userId, achievementId);
    revalidatePath("/achievements");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to verify." };
  }
}

export async function rejectAchievementAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const achievementId = String(formData.get("achievementId") ?? "");
  try {
    requirePermission(ctx.permissions, "achievements.verify");
    await rejectAchievement(ctx.institutionId, ctx.session.authUserId, ctx.userId, achievementId);
    revalidatePath("/achievements");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reject." };
  }
}

export async function approveAchievementAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const achievementId = String(formData.get("achievementId") ?? "");
  try {
    requirePermission(ctx.permissions, "achievements.approve");
    await approveAchievement(ctx.institutionId, ctx.session.authUserId, ctx.userId, achievementId);
    revalidatePath("/achievements");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to approve." };
  }
}
