"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdminContext, setSuperAdminViewInstitution } from "../../../../../services/request-context";
import { setInstitutionModuleEnabled } from "../../../../../services/modules/module-service";

export async function toggleModuleAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireSuperAdminContext();
  const institutionId = String(formData.get("institutionId") ?? "");
  const moduleCode = String(formData.get("moduleCode") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  try {
    await setInstitutionModuleEnabled(ctx.session.authUserId, institutionId, { moduleCode, enabled });
    revalidatePath(`/super-admin/institutions/${institutionId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update module." };
  }
}

/** "Open this institution's console" — sets the view-override cookie
 *  (services/request-context.ts) then sends the Super Admin straight into
 *  the same (institution) app any real admin there uses, so they can click
 *  through every enabled module for real instead of only reading source. */
export async function openInstitutionAction(formData: FormData) {
  const institutionId = String(formData.get("institutionId") ?? "");
  await setSuperAdminViewInstitution(institutionId);
  redirect("/dashboard");
}
