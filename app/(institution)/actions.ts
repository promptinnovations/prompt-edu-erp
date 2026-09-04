"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SUPPORTED_LOCALES, LOCALE_COOKIE } from "../../i18n/request";
import { getAuthService } from "../../services/auth/auth-service";
import { clearSuperAdminViewInstitution, clearSuperAdminViewAsUser } from "../../services/request-context";

export async function exitSuperAdminViewAction() {
  await clearSuperAdminViewInstitution();
  redirect("/super-admin");
}

/** "Exit sample portal" — from the amber banner while a Super Admin is
 *  "viewing as" a specific real person (services/request-context.ts's
 *  viewingAsUser, set from /super-admin/sample-portals). Drops back to the
 *  plain full-catalogue "viewing this institution as Super Admin" state
 *  (task #138) rather than leaving the institution entirely — see
 *  clearSuperAdminViewAsUser()'s own doc comment. */
export async function exitSamplePortalAction() {
  await clearSuperAdminViewAsUser();
  redirect("/dashboard");
}

export async function setLocaleAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "en");
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax" });
}

export async function signOutAction() {
  const auth = await getAuthService();
  await auth.signOut();
  // A stray Super Admin "viewing institution X" override must never survive
  // into a different signed-in session (e.g. someone else using the same
  // browser next) — see request-context.ts's own comment on this function.
  await clearSuperAdminViewInstitution();
  redirect("/login");
}
