"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  markAttendance, applyForLeave, reviewLeaveApplication,
} from "../../../modules/attendance/service";

export async function markAttendanceAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const classId = String(formData.get("classId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const date = String(formData.get("date") ?? "");
  try {
    requirePermission(ctx.permissions, "attendance.enter");
    const studentIds = formData.getAll("studentId").map(String);
    const entries = studentIds.map((studentId) => ({
      studentId,
      statusId: String(formData.get(`status_${studentId}`) ?? ""),
      isLate: formData.get(`late_${studentId}`) === "on",
      lateMinutes: formData.get(`lateMinutes_${studentId}`)
        ? Number(formData.get(`lateMinutes_${studentId}`))
        : null,
    })).filter((e) => e.statusId);
    const result = await markAttendance(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      classId, sectionId, date, entries,
    });
    revalidatePath("/attendance");
    return { error: null, marked: result.marked };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save attendance." };
  }
}

export async function applyForLeaveAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "attendance.enter");
    await applyForLeave(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      applicantType: String(formData.get("applicantType") ?? "student") as "student" | "staff",
      applicantId: String(formData.get("applicantId") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath("/attendance");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit leave application." };
  }
}

async function reviewAction(decision: "approved" | "rejected", formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const leaveId = String(formData.get("leaveId") ?? "");
  try {
    requirePermission(ctx.permissions, "attendance.edit");
    await reviewLeaveApplication(ctx.institutionId, ctx.session.authUserId, ctx.userId, leaveId, decision);
    revalidatePath("/attendance");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to review leave application." };
  }
}

export async function approveLeaveAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewAction("approved", formData);
}
export async function rejectLeaveAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewAction("rejected", formData);
}
