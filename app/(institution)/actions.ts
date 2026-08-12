"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SUPPORTED_LOCALES, LOCALE_COOKIE } from "../../i18n/request";
import { getAuthService } from "../../services/auth/auth-service";
import { clearSuperAdminViewInstitution } from "../../services/request-context";

export async function exitSuperAdminViewAction() {
  await clearSuperAdminViewInstitution();
  redirect("/super-admin");
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
