"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { createAccountCategory, recordTransaction } from "../../../modules/accounts/service";

export async function createAccountCategoryAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "accounts.manage");
    await createAccountCategory(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
      type: (String(formData.get("type") ?? "expense") as "income" | "expense"),
    });
    revalidatePath("/accounts");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create category." };
  }
}

export async function recordTransactionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "accounts.manage");
    await recordTransaction(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      categoryId: String(formData.get("categoryId") ?? ""),
      type: (String(formData.get("type") ?? "expense") as "income" | "expense"),
      amount: Number(formData.get("amount") ?? 0),
      transactionDate: String(formData.get("transactionDate") ?? "") || null,
      description: String(formData.get("description") ?? "") || null,
      vendorName: String(formData.get("vendorName") ?? "") || null,
      itemDescription: String(formData.get("itemDescription") ?? "") || null,
      paymentMethod: (String(formData.get("paymentMethod") ?? "cash") as "cash" | "upi" | "bank_transfer" | "cheque" | "card" | "other"),
      referenceNo: String(formData.get("referenceNo") ?? "") || null,
    });
    revalidatePath("/accounts");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record transaction." };
  }
}
