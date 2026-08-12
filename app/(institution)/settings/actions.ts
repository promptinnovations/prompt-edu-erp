"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { updateInstitutionBranding } from "../../../services/institution/institution-service";

export async function updateBrandingAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    // "reset" is a dedicated hidden field rather than an empty string, so a
    // blank/cleared colour input can never be silently coerced into a
    // colour — resetting is always an explicit, distinct choice.
    const reset = formData.get("reset") === "true";
    const primaryColor = reset ? null : String(formData.get("primaryColor") ?? "");
    await updateInstitutionBranding(ctx.institutionId, ctx.session.authUserId, ctx.userId, { primaryColor });
    revalidatePath("/settings");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update branding." };
  }
}
