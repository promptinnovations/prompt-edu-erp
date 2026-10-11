"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { getOwnParentId, isOwnChild } from "../../../../modules/portal/service";
import { setStudentPhotoFromPortal } from "../../../../modules/portal/student-photo";
import { applyForLeave } from "../../../../modules/attendance/service";
import { submitParentFeePayment } from "../../../../modules/fees/service";
import { sendParentMessage, sendKudos } from "../../../../modules/communication/service";

/** §D.6 follow-up "for parents log in they need to have an option for
 *  apply for leave" — resolves the caller's OWN parentId server-side and
 *  verifies the target child genuinely belongs to them (isOwnChild(), same
 *  §Z portal identity rule every other parent-portal read/write in this
 *  codebase follows) before ever calling applyForLeave() — a parent can
 *  never apply leave for a child that isn't their own, even by guessing a
 *  studentId. */
export async function applyLeaveForChildAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    requirePermission(ctx.permissions, "attendance.leave.apply");
    const ownParentId = await getOwnParentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownParentId) return { error: "Your account isn't linked to a parent/guardian record yet." };
    const isOwn = await isOwnChild(ctx.institutionId, ctx.session.authUserId, ownParentId, studentId);
    if (!isOwn) return { error: "You can only apply for leave for your own child." };

    await applyForLeave(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      applicantType: "student",
      applicantId: studentId,
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
    revalidatePath("/portal/parent");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit leave application." };
  }
}


/** Phase D §3 "in parent portal, there can be an option for paying fee" —
 *  see modules/fees/service.ts's submitParentFeePayment() doc comment for
 *  why this is a record-and-confirm flow rather than a live payment
 *  gateway (none was wired in). Ownership of the invoice's student isn't
 *  re-checked here beyond the invoice already only being shown for the
 *  parent's own children on the page — the invoiceId itself carries no
 *  student identity a parent could spoof into someone else's payment. */
export async function payChildFeeAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "fees.pay_own");
    await submitParentFeePayment(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      invoiceId: String(formData.get("invoiceId") ?? ""),
      amount: Number(formData.get("amount") ?? 0),
      paymentMethod: (String(formData.get("paymentMethod") ?? "upi") as "upi" | "bank_transfer" | "cheque" | "cash" | "card" | "other"),
      referenceNo: String(formData.get("referenceNo") ?? "") || null,
    });
    revalidatePath("/portal/parent");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit payment." };
  }
}

/** §3 "send a communication to teachers, principals". okAt: a fresh
 *  Date.now() on every successful send -- SendMessageForm watches this to
 *  clear the fields and show "Message sent" (§495 "check if there is any
 *  bug in Message button" fix: previously a successful send left the
 *  filled-in form sitting there with no feedback at all, indistinguishable
 *  from a silent failure). */
export async function sendParentMessageAction(_prevState: { error: string | null; okAt?: number }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "") || null;
  try {
    requirePermission(ctx.permissions, "messages.send_to_staff");
    const ownParentId = await getOwnParentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownParentId) return { error: "Your account isn't linked to a parent/guardian record yet." };
    if (studentId) {
      const isOwn = await isOwnChild(ctx.institutionId, ctx.session.authUserId, ownParentId, studentId);
      if (!isOwn) return { error: "You can only message about your own child." };
    }
    await sendParentMessage(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      parentId: ownParentId,
      studentId,
      toUserId: String(formData.get("toUserId") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
    revalidatePath("/portal/parent");
    return { error: null, okAt: Date.now() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send message." };
  }
}

/** §3 "they also can award flowers or congratulations for teachers and
 *  students for performance". Student kudos are restricted to the
 *  parent's OWN children (isOwnChild()); teacher kudos may go to any
 *  staff member at the institution. */
export async function sendKudosAction(_prevState: { error: string | null; okAt?: number }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const toStudentId = String(formData.get("toStudentId") ?? "") || null;
  const toStaffId = String(formData.get("toStaffId") ?? "") || null;
  try {
    requirePermission(ctx.permissions, "kudos.send");
    const ownParentId = await getOwnParentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownParentId) return { error: "Your account isn't linked to a parent/guardian record yet." };
    if (toStudentId) {
      const isOwn = await isOwnChild(ctx.institutionId, ctx.session.authUserId, ownParentId, toStudentId);
      if (!isOwn) return { error: "You can only send kudos to your own child." };
    }
    await sendKudos(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      parentId: ownParentId,
      toStaffId,
      toStudentId,
      kind: (String(formData.get("kind") ?? "flower") as "flower" | "congratulations"),
      message: String(formData.get("message") ?? "") || null,
    });
    revalidatePath("/portal/parent");
    return { error: null, okAt: Date.now() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send kudos." };
  }
}

/** §Portal-photo — a parent sets their child's photo. Same §Z rule as every
 *  other parent action: the posted studentId is honoured only once
 *  isOwnChild() confirms the child is linked to this parent. */
export async function uploadChildPhotoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const studentId = String(formData.get("studentId") ?? "");
  try {
    const ownParentId = await getOwnParentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    if (!ownParentId) return { error: "Your account isn't linked to a parent/guardian record yet." };
    if (!studentId || !(await isOwnChild(ctx.institutionId, ctx.session.authUserId, ownParentId, studentId))) {
      return { error: "You can only change your own child's photo." };
    }
    const photo = formData.get("photo");
    if (!(photo instanceof File)) return { error: "Choose a photo to upload." };
    await setStudentPhotoFromPortal(ctx.institutionId, ctx.session.authUserId, ctx.userId, studentId, photo);
    revalidatePath("/portal", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to upload the photo." };
  }
}

/** §Parent-portal-visual-redesign — remember which child the parent is
 *  viewing (see PARENT_CHILD_COOKIE in ./_lib). Set only after isOwnChild()
 *  confirms the child is linked to this parent. */
export async function selectChildAction(childId: string): Promise<{ error: string | null }> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const ownParentId = await getOwnParentId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
  if (!ownParentId || !(await isOwnChild(ctx.institutionId, ctx.session.authUserId, ownParentId, childId))) {
    return { error: "You can only view your own children." };
  }
  (await cookies()).set("perp_parent_child", childId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
  revalidatePath("/portal/parent", "layout");
  return { error: null };
}
