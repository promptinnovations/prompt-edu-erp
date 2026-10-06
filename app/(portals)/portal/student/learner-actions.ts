"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { getOwnStudentId } from "../../../../modules/portal/service";
import { createLearnerEntry, deleteLearnerEntry } from "../../../../modules/learner-record/service";

/** Students can add only their own reflections and goals — studentId is
 *  resolved server-side, never read from the form. */
export async function addOwnLearnerEntryAction(_prev: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    const ownStudentId = await getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownStudentId) return { error: "No student record is linked to your account." };
    const section = String(formData.get("section") ?? "");
    if (section !== "reflection" && section !== "goal") return { error: "Choose reflection or goal." };
    await createLearnerEntry(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: ownStudentId, section,
      title: String(formData.get("title") ?? ""),
      detail: String(formData.get("detail") ?? "").trim() || null,
      period: String(formData.get("period") ?? "").trim() || null,
    }, "student");
    revalidatePath("/portal/student/record");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save." };
  }
}

export async function deleteOwnLearnerEntryAction(formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  const ownStudentId = await getOwnStudentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
  if (!ownStudentId) return;
  await deleteLearnerEntry(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("entryId") ?? ""), ownStudentId);
  revalidatePath("/portal/student/record");
}
