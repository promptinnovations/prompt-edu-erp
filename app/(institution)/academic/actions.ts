"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createClass, createSection, createSubject,
  updateClass, deleteClass, updateSection, deleteSection,
  assignSubjectToClass, removeSubjectFromClass,
} from "../../../modules/academic/service";

export async function createClassAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
      sortOrder: 0,
    });
    revalidatePath("/academic");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create class." };
  }
}

export async function createSectionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createSection(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      classId: String(formData.get("classId") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/academic");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create section." };
  }
}

export async function createSubjectAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createSubject(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/academic");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create subject." };
  }
}

export async function updateClassAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("classId") ?? ""), {
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/academic");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update class." };
  }
}

export async function deleteClassAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("classId") ?? ""));
    revalidatePath("/academic");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete class." };
  }
}

export async function updateSectionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateSection(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("sectionId") ?? ""), {
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/academic");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update section." };
  }
}

export async function deleteSectionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteSection(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("sectionId") ?? ""));
    revalidatePath("/academic");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete section." };
  }
}

export async function assignClassSubjectAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await assignSubjectToClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      classId: String(formData.get("classId") ?? ""),
      subjectId: String(formData.get("subjectId") ?? ""),
      isCore: true,
    });
    revalidatePath("/academic");
    revalidatePath("/classes");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add subject to class." };
  }
}

export async function removeClassSubjectAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await removeSubjectFromClass(
      ctx.institutionId, ctx.session.authUserId, ctx.userId,
      String(formData.get("classId") ?? ""), String(formData.get("subjectId") ?? "")
    );
    revalidatePath("/academic");
    revalidatePath("/classes");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove subject from class." };
  }
}
