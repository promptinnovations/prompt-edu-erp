"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createClass, createSection, createSubject,
  updateClass, deleteClass, updateSection, deleteSection,
  assignSubjectToClass, removeSubjectFromClass, createAcademicYear,
  setCurrentAcademicYear, promoteClass,
  type PromotionAction,
} from "../../../modules/academic/service";

export async function createClassAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const stage = String(formData.get("stage") ?? "").trim();
    await createClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
      sortOrder: 0,
      stage: stage || null,
    });
    revalidatePath("/academic");
    revalidatePath("/classes");
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
    return { error: err instanceof Error ? err.message : "Failed to create division." };
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
    const hasStage = formData.has("stage");
    await updateClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("classId") ?? ""), {
      name: String(formData.get("name") ?? ""),
      ...(hasStage ? { stage: String(formData.get("stage") ?? "").trim() || null } : {}),
    });
    revalidatePath("/academic");
    revalidatePath("/classes");
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
    return { error: err instanceof Error ? err.message : "Failed to update division." };
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
    return { error: err instanceof Error ? err.message : "Failed to delete division." };
  }
}

export async function createAcademicYearAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createAcademicYear(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      isCurrent: formData.get("isCurrent") === "on",
    });
    revalidatePath("/academic");
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create academic year." };
  }
}

/** "Archive previous year" (§Page-2 follow-up) — flips a different, already
 *  existing year to current; the year that WAS current simply stops being
 *  is_current, i.e. becomes "archived" with no separate flag needed (see
 *  setCurrentAcademicYear()'s doc comment in modules/academic/service.ts). */
export async function setCurrentAcademicYearAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await setCurrentAcademicYear(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("academicYearId") ?? ""));
    revalidatePath("/academic");
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to set current academic year." };
  }
}

export interface PromoteFormResult { error: string | null; result?: Awaited<ReturnType<typeof promoteClass>> }

export async function promoteClassAction(_prevState: PromoteFormResult, formData: FormData): Promise<PromoteFormResult> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "academic.promote");
    const decisionsRaw = String(formData.get("decisions") ?? "[]");
    const decisions = JSON.parse(decisionsRaw) as Array<{
      studentId: string; action: PromotionAction; toClassId?: string | null; toSectionId?: string | null;
    }>;
    const result = await promoteClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      fromClassId: String(formData.get("fromClassId") ?? ""),
      fromSectionId: String(formData.get("fromSectionId") ?? "") || null,
      toAcademicYearId: String(formData.get("toAcademicYearId") ?? ""),
      decisions,
    });
    revalidatePath("/classes");
    revalidatePath("/students");
    return { error: null, result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to promote class." };
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
