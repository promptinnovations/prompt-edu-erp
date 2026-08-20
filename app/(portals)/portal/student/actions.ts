"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { getOwnStudentId } from "../../../../modules/portal/service";
import { createSkillSubmission, submitSkillSubmission } from "../../../../modules/skills/service";
import { submitAchievement } from "../../../../modules/achievements/service";
import { submitOwnReadingReview, reactToReview, placeHold, cancelHold } from "../../../../modules/library/service";

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

/** §Page-8 follow-up "Children can post review of a book they read" —
 *  review can only ever be written after finishing/returning the book
 *  (per the user's own clarification: nobody writes a pre-read review,
 *  they only browse OTHERS' reviews before deciding to borrow), so this
 *  fills in the text on an existing pending reading_records row rather
 *  than creating a new one. requirePermission uses library.view (already
 *  granted to the student role) rather than a new permission code — same
 *  low-stakes reasoning as reacting/holding below: this can only ever
 *  touch the caller's OWN already-existing pending record. */
export async function submitOwnReadingReviewAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.view");
    const ownStudentId = await getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownStudentId) return { error: "No student record is linked to your account." };
    const reviewText = String(formData.get("reviewText") ?? "").trim();
    if (!reviewText) return { error: "Write something about the book first." };

    await submitOwnReadingReview(
      ctx.institutionId, ctx.session.authUserId, ownStudentId,
      String(formData.get("readingRecordId") ?? ""), reviewText
    );
    revalidatePath("/portal/student");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit review." };
  }
}

/** §Page-8 "each children can give like or dislike impression for review". */
export async function reactToReviewAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.view");
    const ownStudentId = await getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownStudentId) return { error: "No student record is linked to your account." };

    const reaction = String(formData.get("reaction") ?? "");
    if (reaction !== "like" && reaction !== "dislike") return { error: "Invalid reaction." };
    await reactToReview(ctx.institutionId, ctx.session.authUserId, ownStudentId, String(formData.get("readingRecordId") ?? ""), reaction);
    revalidatePath("/portal/student");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to react." };
  }
}

/** §Page-8 "A book which has already been issued, another child can pre
 *  book it". */
export async function placeHoldAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.view");
    const ownStudentId = await getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownStudentId) return { error: "No student record is linked to your account." };

    await placeHold(ctx.institutionId, ctx.session.authUserId, ctx.userId, ownStudentId, String(formData.get("bookId") ?? ""));
    revalidatePath("/portal/student");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to pre-book this book." };
  }
}

export async function cancelOwnHoldAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.view");
    const ownStudentId = await getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownStudentId) return { error: "No student record is linked to your account." };
    await cancelHold(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("holdId") ?? ""), ownStudentId);
    revalidatePath("/portal/student");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to cancel." };
  }
}
