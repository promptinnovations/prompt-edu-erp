"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminContext } from "../../services/request-context";
import { createInstitution, updateInstitutionStatus, updateInstitutionCode, setPlatformDefaultPalette } from "../../services/super-admin/super-admin-service";

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

/** Platform-wide default palette (migration 0040) — governs the Super
 *  Admin console's own chrome and the generic /login screen (no
 *  institution context). "Even in Super Admin's console also it should be
 *  available" follow-up. */
export async function updatePlatformPaletteAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireSuperAdminContext();
  try {
    await setPlatformDefaultPalette(ctx.session.authUserId, { themePalette: String(formData.get("themePalette") ?? "") });
    revalidatePath("/super-admin/appearance");
    // Same fix as (institution)/settings/actions.ts's updateThemeAction():
    // revalidatePath("/", "layout") revalidates app/layout.tsx (the root
    // layout applying to the URL "/", a standalone redirect page outside
    // this route group), not app/(super-admin)/layout.tsx, which is where
    // the platform-default palette's <style> tag/sidebar colours actually
    // live. "/super-admin/appearance" shares that layout, so pairing it
    // with type "layout" is what actually invalidates it.
    revalidatePath("/super-admin/appearance", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update the platform default palette." };
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
