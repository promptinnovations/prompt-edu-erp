"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createSkillSubmission, submitSkillSubmission, reviewSkillSubmission, approveSkillSubmission,
} from "../../../modules/skills/service";
import { uploadFile } from "../../../services/storage/file-service";

export async function submitSkillAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "skills.submit");

    // Evidence upload happens BEFORE the submission row is created — same
    // upload-then-link pattern as app/(institution)/achievements/actions.ts's
    // submitAchievementAction(): a failed submission after a successful
    // upload leaves one orphaned file row, not a corrupted submission.
    let evidenceFileId: string | null = null;
    const evidence = formData.get("evidence");
    if (evidence instanceof File && evidence.size > 0) {
      const bytes = Buffer.from(await evidence.arrayBuffer());
      const uploaded = await uploadFile(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
        entityType: "skill_submissions",
        entityId: null,
        fileName: evidence.name,
        mimeType: evidence.type,
        bytes,
      });
      evidenceFileId = uploaded.id;
    }

    const notes = String(formData.get("notes") ?? "");
    const submission = await createSkillSubmission(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: String(formData.get("studentId") ?? ""),
      skillActivityId: String(formData.get("skillActivityId") ?? ""),
      detailsJsonb: notes ? { notes } : undefined,
      evidenceFileId,
    });
    await submitSkillSubmission(ctx.institutionId, ctx.session.authUserId, ctx.userId, submission.id);
    revalidatePath("/skills");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit." };
  }
}

async function reviewAction(decision: "verified" | "rejected" | "returned", formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const submissionId = String(formData.get("submissionId") ?? "");
  try {
    requirePermission(ctx.permissions, "skills.review");
    await reviewSkillSubmission(ctx.institutionId, ctx.session.authUserId, ctx.userId, submissionId, decision);
    revalidatePath("/skills");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to review." };
  }
}

export async function verifySkillSubmissionAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewAction("verified", formData);
}
export async function rejectSkillSubmissionAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewAction("rejected", formData);
}
export async function returnSkillSubmissionAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewAction("returned", formData);
}

export async function approveSkillSubmissionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const submissionId = String(formData.get("submissionId") ?? "");
  try {
    requirePermission(ctx.permissions, "skills.approve");
    await approveSkillSubmission(ctx.institutionId, ctx.session.authUserId, ctx.userId, submissionId);
    revalidatePath("/skills");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to approve." };
  }
}
