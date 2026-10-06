"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { uploadFile } from "../../../services/storage/file-service";
import {
  createLearnerEntry, deleteLearnerEntry, assertCanEditLearnerRecord, LEARNER_SECTIONS, type LearnerSection,
} from "../../../modules/learner-record/service";

export async function addLearnerEntryAction(_prev: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    const studentId = String(formData.get("studentId") ?? "");
    const section = String(formData.get("section") ?? "") as LearnerSection;
    if (!LEARNER_SECTIONS.includes(section)) return { error: "Unknown section." };
    await assertCanEditLearnerRecord(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, studentId);

    let evidenceFileId: string | null = null;
    const file = formData.get("evidence");
    if (file instanceof File && file.size > 0) {
      const up = await uploadFile(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
        entityType: "learner_record", entityId: studentId, fileName: file.name, mimeType: file.type,
        isPublic: false, bytes: Buffer.from(await file.arrayBuffer()),
      });
      evidenceFileId = up.id;
    }
    const s = (k: string) => (String(formData.get(k) ?? "").trim() || null);
    await createLearnerEntry(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId, section, title: String(formData.get("title") ?? ""), detail: s("detail"), value: s("value"),
      level: s("level"), period: s("period"), hours: s("hours") ? Number(s("hours")) : null, entryDate: s("entryDate"), evidenceFileId,
    }, "staff");
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save." };
  }
}

export async function deleteLearnerEntryAction(formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  const studentId = String(formData.get("studentId") ?? "");
  await assertCanEditLearnerRecord(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, studentId);
  await deleteLearnerEntry(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("entryId") ?? ""));
  revalidatePath(`/students/${studentId}`);
}
