"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { skipOnboardingItem, unskipOnboardingItem } from "../../../services/onboarding/onboarding-service";

export async function skipOnboardingItemAction(formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  const itemCode = String(formData.get("itemCode") ?? "");
  if (!itemCode) return;
  await skipOnboardingItem(ctx.institutionId, ctx.session.authUserId, ctx.userId, itemCode);
  revalidatePath("/dashboard");
}

export async function unskipOnboardingItemAction(formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  const itemCode = String(formData.get("itemCode") ?? "");
  if (!itemCode) return;
  await unskipOnboardingItem(ctx.institutionId, ctx.session.authUserId, itemCode);
  revalidatePath("/dashboard");
}
