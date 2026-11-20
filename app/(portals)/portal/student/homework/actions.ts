"use server";

import { revalidatePath } from "next/cache";
import { requireOwnStudentId } from "../_lib";
import { can } from "../../../../../services/permissions/permission-service";
import { setHomeworkDone, HomeworkError } from "../../../../../modules/homework/service";
import type { ActionResult } from "../../../../components/ui/ActionForm";

/** A student ticks their own homework done (or takes the tick back). */
export async function tickOwnHomeworkAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const { ctx, institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return { error: "Your account isn't linked to a student record." };
  if (!can(ctx.permissions, "homework.view")) return { error: "Homework isn't switched on for your account." };
  try {
    await setHomeworkDone(institutionId, authUserId, ctx.userId, String(fd.get("homeworkId") ?? ""), [ownStudentId], fd.get("done") === "1");
    revalidatePath("/portal/student/homework");
    revalidatePath("/portal/student");
    return { error: null, ok: "Saved." };
  } catch (e) {
    if (e instanceof HomeworkError) return { error: e.message };
    console.error("[student homework]", e);
    return { error: "Something went wrong — please try again." };
  }
}
