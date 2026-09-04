"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createFeeCategory, createFeeStructure, assignFeeStructureToClass, assignAdHocFee,
  recordFeePayment, confirmPendingFeePayment,
} from "../../../modules/fees/service";

export async function createFeeCategoryAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "fees.manage");
    await createFeeCategory(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
    });
    revalidatePath("/fees");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create category." };
  }
}

export async function createFeeStructureAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "fees.manage");
    const classId = String(formData.get("classId") ?? "") || null;
    await createFeeStructure(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      feeCategoryId: String(formData.get("feeCategoryId") ?? ""),
      academicYearId: String(formData.get("academicYearId") ?? ""),
      classId,
      amount: Number(formData.get("amount") ?? 0),
      dueDate: String(formData.get("dueDate") ?? "") || null,
    });
    revalidatePath("/fees");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create fee structure." };
  }
}

export async function assignFeeStructureAction(_prevState: { error: string | null; message?: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "fees.manage");
    const feeStructureId = String(formData.get("feeStructureId") ?? "");
    const result = await assignFeeStructureToClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, feeStructureId);
    revalidatePath("/fees");
    return { error: null, message: `${result.invoicesCreated} invoice(s) created.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to assign fee." };
  }
}

export async function assignAdHocFeeAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "fees.manage");
    await assignAdHocFee(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId: String(formData.get("studentId") ?? ""),
      feeCategoryId: String(formData.get("feeCategoryId") ?? ""),
      academicYearId: String(formData.get("academicYearId") ?? ""),
      amount: Number(formData.get("amount") ?? 0),
      dueDate: String(formData.get("dueDate") ?? "") || null,
    });
    revalidatePath("/fees");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to assign fee." };
  }
}

export async function recordFeePaymentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "fees.collect");
    const referenceNo = String(formData.get("referenceNo") ?? "") || null;
    const notes = String(formData.get("notes") ?? "") || null;
    await recordFeePayment(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      invoiceId: String(formData.get("invoiceId") ?? ""),
      amount: Number(formData.get("amount") ?? 0),
      paymentMethod: (String(formData.get("paymentMethod") ?? "cash") as "cash" | "upi" | "bank_transfer" | "cheque" | "card" | "other"),
      referenceNo,
      notes,
    });
    revalidatePath("/fees");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record payment." };
  }
}

export async function confirmPendingFeePaymentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "fees.collect");
    const paymentId = String(formData.get("paymentId") ?? "");
    const decision = String(formData.get("decision") ?? "confirmed") as "confirmed" | "rejected";
    await confirmPendingFeePayment(ctx.institutionId, ctx.session.authUserId, ctx.userId, paymentId, decision);
    revalidatePath("/fees");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update payment." };
  }
}
