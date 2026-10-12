"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminContext } from "../../services/request-context";
import { createInstitution, updateInstitutionStatus, updateInstitutionCode, updateInstitutionName } from "../../services/super-admin/super-admin-service";

export async function createInstitutionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireSuperAdminContext();
  try {
    const adminEmail = String(formData.get("adminEmail") ?? "") || undefined;
    const adminFullName = String(formData.get("adminFullName") ?? "") || undefined;
    const adminPassword = String(formData.get("adminPassword") ?? "") || undefined;
    const board = String(formData.get("board") ?? "") || undefined;
    await createInstitution(ctx.session.authUserId, {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      type: (String(formData.get("type") ?? "other")) as "madrasa" | "islamic_school" | "school" | "college" | "dars" | "other",
      board: board as "sksvb" | "skimvb" | undefined,
      educationMode: (String(formData.get("educationMode") ?? "academic")) as "academic" | "islamic" | "both",
      defaultLocale: (String(formData.get("defaultLocale") ?? "en")) as "en" | "ml",
      adminEmail, adminFullName, adminPassword,
    });
    revalidatePath("/super-admin");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create institution." };
  }
}

export async function updateInstitutionStatusAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireSuperAdminContext();
  const institutionId = String(formData.get("institutionId") ?? "");
  const status = String(formData.get("status") ?? "");
  try {
    await updateInstitutionStatus(ctx.session.authUserId, institutionId, { status: status as "active" | "inactive" | "suspended" | "trial" });
    revalidatePath("/super-admin");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update institution status." };
  }
}

export async function updateInstitutionCodeAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireSuperAdminContext();
  const institutionId = String(formData.get("institutionId") ?? "");
  const code = String(formData.get("code") ?? "");
  try {
    await updateInstitutionCode(ctx.session.authUserId, institutionId, { code });
    revalidatePath("/super-admin");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update institution URL." };
  }
}

export async function updateInstitutionNameAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireSuperAdminContext();
  const institutionId = String(formData.get("institutionId") ?? "");
  const name = String(formData.get("name") ?? "");
  try {
    await updateInstitutionName(ctx.session.authUserId, institutionId, { name });
    // Same as updateInstitutionCodeAction/updateInstitutionStatusAction
    // above — only the Super Admin console list itself needs an explicit
    // revalidatePath. The institution's own pages (under its /<code>/...
    // prefix, rewritten by middleware.ts to the (institution) route group)
    // are plain dynamic Server Components reading cookies/headers per
    // request, not statically cached, so they pick up the new name on
    // their own next navigation with no extra revalidation call.
    revalidatePath("/super-admin");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update institution name." };
  }
}
