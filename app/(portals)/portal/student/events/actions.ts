"use server";

import { revalidatePath } from "next/cache";
import { requireOwnStudentId } from "../_lib";
import { can } from "../../../../../services/permissions/permission-service";
import { enrolEntry, withdrawEntry, EventsError } from "../../../../../modules/events/service";
import type { ActionResult } from "../../../../components/ui/ActionForm";

/** A student enrolling themself in an open individual item, or taking that
 *  entry back while enrolment is open. The service re-checks eligibility,
 *  limits and that the entry is their own. */
async function run(fn: (i: string, a: string, userId: string, studentId: string) => Promise<string>): Promise<ActionResult> {
  const { ctx, institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return { error: "Your account isn't linked to a student record." };
  if (!can(ctx.permissions, "events.enrol_self")) return { error: "Enrolling yourself isn't switched on for your account." };
  try {
    const ok = await fn(institutionId, authUserId, ctx.userId, ownStudentId);
    revalidatePath("/portal/student/events");
    return { error: null, ok };
  } catch (e) {
    if (e instanceof EventsError) return { error: e.message };
    console.error("[student events]", e);
    return { error: "Something went wrong — please try again." };
  }
}

export async function selfEnrolAction(_p: ActionResult, fd: FormData) {
  return run(async (i, a, u, sid) => {
    const r = await enrolEntry(i, a, u, { itemId: String(fd.get("itemId") ?? ""), studentIds: [sid], mode: "self" });
    return `You're in — your entry number is ${r.entry_no}.`;
  });
}

export async function selfWithdrawAction(_p: ActionResult, fd: FormData) {
  return run(async (i, a, u, sid) => {
    await withdrawEntry(i, a, u, String(fd.get("entryId") ?? ""), "self", sid);
    return "Entry withdrawn.";
  });
}
