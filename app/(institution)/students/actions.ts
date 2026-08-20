"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createStudent, enrollStudent, createParent, linkParentToStudent,
  updateStudent, deleteStudent, restoreStudent,
  updateParent, unlinkParentFromStudent, deleteParentRecord,
  transferStudentEnrollment, removeStudentFromClass, restoreEnrollment, assignRollNumbers,
  updateStudentPhoto,
} from "../../../modules/students/service";
import {
  provisionStudentPortalAccount, provisionParentPortalAccount,
  createStudentLoginAccount, resetStudentLoginPassword,
} from "../../../modules/portal/service";
import { uploadFile } from "../../../services/storage/file-service";

/** §Page-3 follow-up "Student Profile ... Photo" — same upload-then-link
 *  shape as the institution logo (app/(institution)/settings/actions.ts's
 *  uploadInstitutionLogoAction): upload the bytes via FileService first,
 *  then point students.photo_file_id at the resulting file id. isPublic:
 *  false — unlike the institution logo, a student photo is never shown on
 *  a pre-auth page, so it stays behind the authenticated /api/files route. */
export async function uploadStudentPhotoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "student.edit");
    const studentId = String(formData.get("studentId") ?? "");
    const photo = formData.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return { error: "Choose an image file to upload." };

    const bytes = Buffer.from(await photo.arrayBuffer());
    const uploaded = await uploadFile(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      entityType: "students", entityId: studentId, fileName: photo.name, mimeType: photo.type, isPublic: false, bytes,
    });
    await updateStudentPhoto(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId, uploaded.id);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/students");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to upload photo." };
  }
}

export async function removeStudentPhotoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "student.edit");
    const studentId = String(formData.get("studentId") ?? "");
    await updateStudentPhoto(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId, null);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/students");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove photo." };
  }
}

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

/** §137 follow-up "moving from one class to another" — closes the current
 *  active enrollment and opens a new one; see transferStudentEnrollment()'s
 *  doc comment for why that's two writes rather than an UPDATE in place. */
export async function moveStudentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    await transferStudentEnrollment(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId,
      newClassId: String(formData.get("classId") ?? ""),
      newSectionId: String(formData.get("sectionId") ?? ""),
    });
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to move student to the new class." };
  }
}

/** §137 follow-up "removing" — unenrolls from the current class without
 *  withdrawing the student from the institution; see
 *  removeStudentFromClass()'s doc comment for how this differs from
 *  deleteStudentAction() below. */
export async function removeFromClassAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    await removeStudentFromClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId, String(formData.get("reason") ?? "") || null);
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove the student from their class." };
  }
}

/** §137 follow-up "if required for restoring" — brings back a removed or
 *  transferred enrollment row exactly as it was. */
export async function restoreEnrollmentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    await restoreEnrollment(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("enrollmentId") ?? ""));
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to restore the enrollment." };
  }
}

/** §137 follow-up "roll number should be male first ... then girls" —
 *  recomputes the whole class+section's roll numbers on demand from the
 *  Classes hub (see app/(institution)/classes/[classId]/page.tsx). */
export async function recomputeRollNumbersAction(
  _prevState: { error: string | null; count: number | undefined }, formData: FormData
): Promise<{ error: string | null; count: number | undefined }> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution.", count: undefined };
  const classId = String(formData.get("classId") ?? "");
  try {
    requirePermission(ctx.permissions, "student.edit");
    const count = await assignRollNumbers(
      ctx.institutionId, ctx.session.authUserId, ctx.userId,
      classId, String(formData.get("sectionId") ?? ""), String(formData.get("academicYearId") ?? "")
    );
    revalidatePath(`/classes/${classId}`);
    revalidatePath("/students");
    return { error: null, count };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to recompute roll numbers.", count: undefined };
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
