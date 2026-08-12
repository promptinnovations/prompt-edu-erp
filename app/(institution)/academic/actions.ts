"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { createClass, createSection, createSubject } from "../../../modules/academic/service";

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
