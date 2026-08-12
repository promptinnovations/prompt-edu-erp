"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { createStudent, enrollStudent, createParent, linkParentToStudent } from "../../../modules/students/service";
import { provisionStudentPortalAccount, provisionParentPortalAccount } from "../../../modules/portal/service";

export async function createStudentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "student.create");
    await createStudent(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      admissionNumber: String(formData.get("admissionNumber") ?? ""),
      fullName: String(formData.get("fullName") ?? ""), // Unicode-safe — any script (§S.3)
    });
    revalidatePath("/students");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create student." };
  }
}

export async function enrollStudentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "student.edit");
    await enrollStudent(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: String(formData.get("studentId") ?? ""),
      academicYearId: String(formData.get("academicYearId") ?? ""),
      classId: String(formData.get("classId") ?? ""),
      sectionId: String(formData.get("sectionId") ?? ""),
    });
    revalidatePath(`/students/${formData.get("studentId")}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to enroll student." };
  }
}


export async function createParentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    const parent = await createParent(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      occupation: String(formData.get("occupation") ?? "") || null,
    });
    await linkParentToStudent(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId,
      parentId: parent.id,
      relationship: String(formData.get("relationship") ?? "") || null,
      isPrimaryContact: formData.get("isPrimaryContact") === "on",
    });
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add parent/guardian." };
  }
}

export async function provisionStudentPortalAccountAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "users.manage");
    await provisionStudentPortalAccount(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId,
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
    });
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to provision student portal account." };
  }
}

export async function provisionParentPortalAccountAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("redirectStudentId") ?? "");
  try {
    requirePermission(ctx.permissions, "users.manage");
    await provisionParentPortalAccount(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      parentId: String(formData.get("parentId") ?? ""),
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
    });
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to provision parent portal account." };
  }
}
