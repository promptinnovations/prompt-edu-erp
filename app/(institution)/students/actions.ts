"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createStudent, enrollStudent, createParent, linkParentToStudent,
  updateStudent, deleteStudent, restoreStudent,
  updateParent, unlinkParentFromStudent, deleteParentRecord,
} from "../../../modules/students/service";
import {
  provisionStudentPortalAccount, provisionParentPortalAccount,
  createStudentLoginAccount, resetStudentLoginPassword,
} from "../../../modules/portal/service";

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

export async function updateStudentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    await updateStudent(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId, {
      admissionNumber: String(formData.get("admissionNumber") ?? "") || undefined,
      fullName: String(formData.get("fullName") ?? "") || undefined,
      dateOfBirth: String(formData.get("dateOfBirth") ?? "") || null,
      gender: String(formData.get("gender") ?? "") || null,
    });
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update student." };
  }
}

/** Soft-delete — see modules/students/service.ts's deleteStudent() doc
 *  comment for why this isn't a hard DELETE. */
export async function deleteStudentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.delete");
    await deleteStudent(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId);
    revalidatePath("/students");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete student." };
  }
}

export async function restoreStudentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    await restoreStudent(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId);
    revalidatePath("/students");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to restore student." };
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

export async function updateParentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    await updateParent(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("parentId") ?? ""), {
      fullName: String(formData.get("fullName") ?? "") || undefined,
      phone: String(formData.get("phone") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      occupation: String(formData.get("occupation") ?? "") || null,
    });
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update parent/guardian." };
  }
}

/** Removes this parent/guardian from THIS student only — see
 *  modules/students/service.ts's unlinkParentFromStudent() doc comment. */
export async function removeParentFromStudentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    await unlinkParentFromStudent(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId, String(formData.get("parentId") ?? ""));
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove parent/guardian." };
  }
}

/** Deletes the parent/guardian record entirely (all of their children, not
 *  just this one) — see modules/students/service.ts's deleteParentRecord()
 *  doc comment. Gated on users.manage (not just student.edit) since it's
 *  the more consequential, harder-to-undo of the two removal actions. */
export async function deleteParentRecordAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "users.manage");
    await deleteParentRecord(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("parentId") ?? ""));
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete parent/guardian." };
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

/** §137 follow-up: "their log in id (must be student name, password- phone
 *  number of parent)" — creates the name/phone student login described
 *  there. See modules/portal/service.ts's createStudentLoginAccount(). */
export async function createStudentLoginAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "users.manage");
    await createStudentLoginAccount(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId,
      parentPhone: String(formData.get("parentPhone") ?? ""),
    });
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create student login." };
  }
}

export async function resetStudentLoginAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "users.manage");
    await resetStudentLoginPassword(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId, String(formData.get("parentPhone") ?? ""));
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reset the student login password." };
  }
}
