"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { can, requirePermission } from "../../../services/permissions/permission-service";
import {
  markAttendance, applyForLeave, reviewLeaveApplication, getAttendanceAlertCandidates,
  sendAttendanceAlerts, canReviewLeaveApplication, type AttendanceAlertCandidate,
} from "../../../modules/attendance/service";
import { getOwnStaffId } from "../../../modules/mentoring/service";

export async function markAttendanceAction(
  _prevState: { error: string | null; marked?: number; alerts?: AttendanceAlertCandidate[] },
  formData: FormData
) {
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
    // §D.6 follow-up: "once attendance is saved, a preview of absentee and
    // latecoming alert will be shown" — attendance is already persisted at
    // this point regardless of what happens next; this just computes what
    // the confirm-to-send preview should show.
    const alerts = await getAttendanceAlertCandidates(ctx.institutionId, ctx.session.authUserId, classId, sectionId, date);
    revalidatePath("/attendance");
    return { error: null, marked: result.marked, alerts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save attendance." };
  }
}

export async function sendAttendanceAlertsAction(
  _prevState: { error: string | null; sent?: number; skipped?: number },
  formData: FormData
) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "attendance.enter");
    const studentIds = formData.getAll("alertStudentId").map(String);
    const alerts = studentIds
      .map((studentId) => ({ studentId, message: String(formData.get(`alertMessage_${studentId}`) ?? "") }))
      .filter((a) => a.message.trim().length > 0);
    if (alerts.length === 0) return { error: null, sent: 0, skipped: 0 };
    const results = await sendAttendanceAlerts(ctx.institutionId, ctx.session.authUserId, ctx.userId, { alerts });
    revalidatePath("/attendance");
    return { error: null, sent: results.filter((r) => r.ok).length, skipped: results.filter((r) => !r.ok).length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send attendance alerts." };
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

/** Self-service leave application (§Page-4 follow-up "each staff...should
 *  have a portion for applying leave from their own page" — replaces the
 *  old admin-picks-a-name-from-a-dropdown form that used to live on /staff).
 *  Deliberately requires NO attendance.* permission: the caller's OWN
 *  staffId is resolved server-side via getOwnStaffId() (never a
 *  client-supplied id), so any staff member — including one who holds no
 *  attendance permission at all, e.g. a librarian — can apply for their own
 *  leave. A caller with no linked staff row (shouldn't normally reach this
 *  page, but guarded anyway) gets a clear error instead of a silent no-op. */
export async function applyForOwnLeaveAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    const ownStaffId = await getOwnStaffId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownStaffId) return { error: "Your account isn't linked to a staff record, so you can't apply for leave here." };
    await applyForLeave(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      applicantType: "staff",
      applicantId: ownStaffId,
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      reason: String(formData.get("reason") ?? "") || null,
    });
    revalidatePath("/attendance");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit leave application." };
  }
}

/** Approve/reject a leave application — unrestricted for attendance.edit
 *  holders (institution_admin/management), scoped to "my own class only"
 *  for attendance.leave.review_own_class holders (class teachers). Neither
 *  permission alone authorizes the specific leaveId; canReviewLeaveApplication()
 *  makes that call (§D.6 follow-up "class teacher can sanction it"). */
async function reviewAction(decision: "approved" | "rejected", formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const leaveId = String(formData.get("leaveId") ?? "");
  try {
    const hasUnrestrictedEdit = can(ctx.permissions, "attendance.edit");
    if (!hasUnrestrictedEdit) requirePermission(ctx.permissions, "attendance.leave.review_own_class");
    const allowed = await canReviewLeaveApplication(
      ctx.institutionId, ctx.session.authUserId, ctx.userId, hasUnrestrictedEdit, leaveId
    );
    if (!allowed) throw new Error("Forbidden: you can only review leave applications for your own assigned class.");
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
