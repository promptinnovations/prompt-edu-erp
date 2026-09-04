"use server";

import { redirect } from "next/navigation";
import { setSuperAdminViewAsUser } from "../../../../services/request-context";

/** One shared action for every "View as ..." button on this page — the
 *  destination path is passed straight through from the button (never
 *  derived from the role code here) so Principal/Management/Class Teacher
 *  land on /dashboard (the normal institution console) while Student/
 *  Parent land on their own portal route, exactly like a real person with
 *  that role would after signing in (app/(auth)/login/actions.ts's own
 *  role-based redirect). */
export async function viewAsSamplePortalAction(formData: FormData) {
  const institutionId = String(formData.get("institutionId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const roleLabel = String(formData.get("roleLabel") ?? "");
  const dest = String(formData.get("dest") ?? "/dashboard");
  await setSuperAdminViewAsUser(institutionId, userId, roleLabel);
  redirect(dest);
}
