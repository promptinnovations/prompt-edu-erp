"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createStaffMember, markStaffAttendance,
  applyForStaffLeave, reviewStaffLeave,
  createPortionPlan, recordPortionCompletion,
  recordTeacherObservation, createTeacherAssignment,
} from "../../../modules/staff/service";

export async function createStaffAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.create");
    await createStaffMember(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      staffCode: String(formData.get("staffCode") ?? ""),
      designation: String(formData.get("designation") ?? "") || null,
      department: String(formData.get("department") ?? "") || null,
      joiningDate: String(formData.get("joiningDate") ?? "") || null,
      employmentStatus: "active",
      roleCode: String(formData.get("roleCode") ?? "") || undefined,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add staff member." };
  }
}

export async function markStaffAttendanceAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "attendance.enter");
    const date = String(formData.get("date") ?? "");
    const staffIds = formData.getAll("staffId").map(String);
    const entries = staffIds
      .map((staffId) => ({ staffId, statusId: String(formData.get(`status_${staffId}`) ?? "") }))
      .filter((e) => e.statusId);
    const result = await markStaffAttendance(ctx.institutionId, ctx.session.authUserId, ctx.userId, { date, entries });
    revalidatePath("/staff");
    return { error: null, marked: result.marked };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save staff attendance." };
  }
}

export async function applyForStaffLeaveAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "attendance.enter");
    await applyForStaffLeave(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      staffId: String(formData.get("staffId") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      reason: String(formData.get("reason") ?? "") || null,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit leave application." };
  }
}

async function reviewStaffLeaveAction(decision: "approved" | "rejected", formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "attendance.edit");
    await reviewStaffLeave(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("leaveId") ?? ""), decision);
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to review leave application." };
  }
}
export async function approveStaffLeaveAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewStaffLeaveAction("approved", formData);
}
export async function rejectStaffLeaveAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewStaffLeaveAction("rejected", formData);
}

export async function createPortionPlanAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.portion.manage");
    await createPortionPlan(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      academicYearId: String(formData.get("academicYearId") ?? ""),
      classId: String(formData.get("classId") ?? ""),
      subjectId: String(formData.get("subjectId") ?? ""),
      teacherId: String(formData.get("teacherId") ?? ""),
      chapterName: String(formData.get("chapterName") ?? ""),
      plannedDate: String(formData.get("plannedDate") ?? "") || null,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create portion plan." };
  }
}

export async function recordPortionCompletionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.portion.manage");
    await recordPortionCompletion(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      portionPlanId: String(formData.get("portionPlanId") ?? ""),
      completedDate: String(formData.get("completedDate") ?? ""),
      completionPercent: Number(formData.get("completionPercent") ?? 0),
      notes: String(formData.get("notes") ?? "") || null,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record portion completion." };
  }
}

export async function recordTeacherObservationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.observation.manage");
    await recordTeacherObservation(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      teacherId: String(formData.get("teacherId") ?? ""),
      date: String(formData.get("date") ?? ""),
      overallNotes: String(formData.get("overallNotes") ?? "") || null,
      followUpNotes: String(formData.get("followUpNotes") ?? "") || null,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record observation." };
  }
}

export async function createTeacherAssignmentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.assignment.manage");
    await createTeacherAssignment(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      userId: String(formData.get("userId") ?? ""),
      classId: String(formData.get("classId") ?? ""),
      sectionId: String(formData.get("sectionId") ?? "") || null,
      subjectId: String(formData.get("subjectId") ?? "") || null,
      academicYearId: String(formData.get("academicYearId") ?? ""),
      roleType: (String(formData.get("roleType") ?? "subject_teacher")) as "class_teacher" | "subject_teacher",
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create teacher assignment." };
  }
}
