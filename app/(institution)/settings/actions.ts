"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  updateInstitutionTheme, updateInstitutionLogo,
  updateParentPortalSections, PARENT_PORTAL_SECTION_KEYS,
  type ParentPortalSections,
} from "../../../services/institution/institution-service";
import { uploadFile } from "../../../services/storage/file-service";

export async function updateThemeAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    // "reset" is a dedicated hidden field rather than an empty selection,
    // so "use the platform default" is always an explicit, distinct choice
    // — same pattern the old single-colour picker used.
    const reset = formData.get("reset") === "true";
    const themePalette = reset ? null : String(formData.get("themePalette") ?? "");
    await updateInstitutionTheme(ctx.institutionId, ctx.session.authUserId, ctx.userId, { themePalette });
    revalidatePath("/settings");
    // §Palette-picker follow-up bug ("selected colour combo, no changes
    // yet"): revalidatePath("/", "layout") revalidates the layout that
    // applies to the URL "/" -- which is app/layout.tsx (the true root
    // layout), NOT app/(institution)/layout.tsx. "/" is its own standalone
    // redirect page (app/page.tsx), outside the (institution) route group
    // entirely, so it never actually shared a layout with /settings in the
    // first place -- this call did nothing useful. The palette <style> tag,
    // sidebar, and button colours all live in (institution)/layout.tsx,
    // which wraps /settings itself, so THAT'S the path+type pair that
    // actually invalidates it (Next.js revalidates every route sharing the
    // same layout as the given path, not just that literal path).
    revalidatePath("/settings", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update the colour theme." };
  }
}

/** "Can I add institution logo?" follow-up — mirrors submitAchievementAction's
 *  upload-then-link shape (services/storage/file-service.ts's uploadFile()
 *  first, in its own transaction; institutions.logo_file_id only ever points
 *  at an already-uploaded file). isPublic: true is required — this is the
 *  one file every institution needs a genuinely pre-authentication reader
 *  (the /login page, before anyone has signed in) to be able to fetch, via
 *  getPublicLogoFile()'s narrowly-scoped lookup in institution-service.ts. */
export async function uploadInstitutionLogoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const logo = formData.get("logo");
    if (!(logo instanceof File) || logo.size === 0) return { error: "Choose an image file to upload." };

    const bytes = Buffer.from(await logo.arrayBuffer());
    const uploaded = await uploadFile(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      entityType: "institution_logo",
      entityId: ctx.institutionId,
      fileName: logo.name,
      mimeType: logo.type,
      isPublic: true,
      bytes,
    });
    await updateInstitutionLogo(ctx.institutionId, ctx.session.authUserId, ctx.userId, uploaded.id);
    revalidatePath("/settings");
    // Same fix as updateThemeAction() above -- the sidebar logo lives in
    // (institution)/layout.tsx, so the revalidation needs `"layout"` type
    // to actually reach it, not just the default `"page"` type this used
    // to have (which only invalidated the /dashboard PAGE segment).
    revalidatePath("/dashboard", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to upload logo." };
  }
}

/** Detaches the logo (institutions.logo_file_id -> null) without deleting
 *  the underlying file row — same "leave the file, just unlink it" choice
 *  achievements/skills make for their own attachments; nothing else in this
 *  codebase currently needs to reclaim that storage space aggressively. */
export async function removeInstitutionLogoAction(_prevState: { error: string | null }, _formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateInstitutionLogo(ctx.institutionId, ctx.session.authUserId, ctx.userId, null);
    revalidatePath("/settings");
    revalidatePath("/dashboard", "layout");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove logo." };
  }
}

/** §Page-3 follow-up "Student Portfolio Management — designing children's
 *  page, what should be shown in the Parent portal" — a plain checkbox set,
 *  one boolean per section key; reads all PARENT_PORTAL_SECTION_KEYS off the
 *  form (unchecked = absent from FormData, per standard HTML checkbox
 *  semantics) so adding a new section later needs no new server-action
 *  wiring, just a new checkbox in the form + a new key in the shared const. */
export async function updateParentPortalSectionsAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const sections = Object.fromEntries(
      PARENT_PORTAL_SECTION_KEYS.map((key) => [key, formData.get(key) === "on"])
    ) as ParentPortalSections;
    await updateParentPortalSections(ctx.institutionId, ctx.session.authUserId, ctx.userId, sections);
    revalidatePath("/settings");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update parent portal settings." };
  }
}
