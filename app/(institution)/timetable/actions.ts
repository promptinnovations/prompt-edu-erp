"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { acknowledgeSubstitution } from "../../../modules/substitution/service";

/** The covering teacher taps a highlighted substitution to confirm it. The
 *  service only lets the teacher assigned to that very substitution sign. */
export async function acknowledgeSubstitutionAction(formData: FormData): Promise<void> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  const id = String(formData.get("substitutionId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  await acknowledgeSubstitution(ctx.institutionId, ctx.session.authUserId, ctx.userId, id);
  revalidatePath("/timetable");
  revalidatePath("/substitution");
  revalidatePath("/dashboard");
}
