"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createDisciplineRecord, recordDisciplineFollowUp, recordCharacterAssessment,
  createDisciplineCategory, updateDisciplineCategory, setDisciplineCategoryActive, moveDisciplineCategory,
  createCharacterAttribute, updateCharacterAttribute, setCharacterAttributeActive, moveCharacterAttribute,
  updateCharacterRatingLabel,
} from "../../../modules/discipline/service";
import { uploadFile } from "../../../services/storage/file-service";

export async function createDisciplineRecordAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "discipline.record");

    // Evidence photo — same upload-then-link pattern as achievements'
    // certificate upload (see app/(institution)/achievements/actions.ts).
    let evidencePhotoFileId: string | null = null;
    const photo = formData.get("evidencePhoto");
    if (photo instanceof File && photo.size > 0) {
      const bytes = Buffer.from(await photo.arrayBuffer());
      const uploaded = await uploadFile(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
        entityType: "discipline_records", entityId: null, fileName: photo.name, mimeType: photo.type, bytes,
      });
      evidencePhotoFileId = uploaded.id;
    }

    await createDisciplineRecord(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: String(formData.get("studentId") ?? ""),
      categoryId: String(formData.get("categoryId") ?? ""),
      date: String(formData.get("date") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      severity: String(formData.get("severity") ?? "") || null,
      actionTaken: String(formData.get("actionTaken") ?? "") || null,
      evidencePhotoFileId,
    });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record discipline entry." };
  }
}

// ---------------------------------------------------------------------------
// Config: discipline categories / character attributes / rating labels
// (§354 "Admin to add, edit, deactivate, and manage categories/attributes
// without changing the system")
// ---------------------------------------------------------------------------
export async function createDisciplineCategoryAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createDisciplineCategory(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
      isPositive: formData.get("isPositive") === "on",
    });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add category." };
  }
}

export async function updateDisciplineCategoryAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateDisciplineCategory(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("categoryId") ?? ""), {
      name: String(formData.get("name") ?? "") || undefined,
      isPositive: formData.get("isPositive") === "on",
    });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update category." };
  }
}

export async function toggleDisciplineCategoryActiveAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await setDisciplineCategoryActive(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("categoryId") ?? ""), formData.get("isActive") === "true");
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update category." };
  }
}

export async function moveDisciplineCategoryAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const direction = String(formData.get("direction") ?? "up") === "down" ? "down" : "up";
    await moveDisciplineCategory(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("categoryId") ?? ""), direction);
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reorder category." };
  }
}

export async function createCharacterAttributeAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createCharacterAttribute(ctx.institutionId, ctx.session.authUserId, ctx.userId, { name: String(formData.get("name") ?? "") });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add attribute." };
  }
}

export async function updateCharacterAttributeAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateCharacterAttribute(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("attributeId") ?? ""), {
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update attribute." };
  }
}

export async function toggleCharacterAttributeActiveAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await setCharacterAttributeActive(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("attributeId") ?? ""), formData.get("isActive") === "true");
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update attribute." };
  }
}

export async function moveCharacterAttributeAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const direction = String(formData.get("direction") ?? "up") === "down" ? "down" : "up";
    await moveCharacterAttribute(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("attributeId") ?? ""), direction);
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reorder attribute." };
  }
}

export async function updateCharacterRatingLabelAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateCharacterRatingLabel(ctx.institutionId, ctx.session.authUserId, ctx.userId, Number(formData.get("rating") ?? 0), {
      label: String(formData.get("label") ?? ""),
    });
    revalidatePath("/discipline");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update rating label." };
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
