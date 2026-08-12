"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { getOwnStudentId } from "../../../../modules/portal/service";
import { createSkillSubmission, submitSkillSubmission } from "../../../../modules/skills/service";
import { submitAchievement } from "../../../../modules/achievements/service";

/** Every action here resolves the caller's OWN studentId server-side —
 *  studentId is never read from form input, so a student can only ever
 *  submit as themselves (§Z portal identity rule, modules/portal/service.ts). */
export async function submitOwnSkillAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "skills.submit");
    const ownStudentId = await getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownStudentId) return { error: "No student record is linked to your account." };

    const submission = await createSkillSubmission(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      skillActivityId: String(formData.get("skillActivityId") ?? ""),
      studentId: ownStudentId,
    });
    await submitSkillSubmission(ctx.institutionId, ctx.session.authUserId, ctx.userId, submission.id);
    revalidatePath("/portal/student");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit." };
  }
}

export async function submitOwnAchievementAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "achievements.submit");
    const ownStudentId = await getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownStudentId) return { error: "No student record is linked to your account." };

    await submitAchievement(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: ownStudentId,
      categoryId: String(formData.get("categoryId") ?? ""),
      levelId: String(formData.get("levelId") ?? ""),
      title: String(formData.get("title") ?? ""),
      position: String(formData.get("position") ?? "") || null,
    });
    revalidatePath("/portal/student");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit achievement." };
  }
}
