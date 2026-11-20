"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { createHomework, deleteHomework, saveHomeworkTicks, HomeworkError } from "../../../modules/homework/service";
import type { ActionResult } from "../../components/ui/ActionForm";

/** Management / admins set homework for any class; teachers for their own. */
const isBroad = (ctx: Awaited<ReturnType<typeof requireRequestContext>>) =>
  ctx.isSuperAdmin || can(ctx.permissions, "settings.manage") || can(ctx.permissions, "marks.approve");

async function run(fn: (ctx: Awaited<ReturnType<typeof requireRequestContext>>, i: string, a: string) => Promise<string>): Promise<ActionResult> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  if (!ctx.isSuperAdmin && !can(ctx.permissions, "homework.set")) return { error: "You don't have permission to set homework." };
  try {
    const ok = await fn(ctx, ctx.institutionId, ctx.session.authUserId);
    revalidatePath("/homework", "layout");
    return { error: null, ok };
  } catch (e) {
    if (e instanceof HomeworkError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form." };
    console.error("[homework]", e);
    return { error: "Something went wrong — please try again." };
  }
}

/** `target` = "<classId>|<sectionId or ''>|<subjectId or ''>". */
export async function createHomeworkAction(_p: ActionResult, fd: FormData) {
  return run(async (ctx, i, a) => {
    const [classId, sectionId, subjectId] = String(fd.get("target") ?? "").split("|");
    await createHomework(i, a, ctx.userId, {
      classId: classId ?? "",
      sectionId: sectionId || null,
      subjectId: subjectId || null,
      title: String(fd.get("title") ?? ""),
      details: String(fd.get("details") ?? "").trim() || null,
      dueDate: String(fd.get("dueDate") ?? ""),
    }, { broad: isBroad(ctx) });
    return "Homework set — students can see it now.";
  });
}

export async function deleteHomeworkAction(_p: ActionResult, fd: FormData) {
  return run(async (ctx, i, a) => {
    await deleteHomework(i, a, ctx.userId, String(fd.get("homeworkId") ?? ""), { broad: isBroad(ctx) });
    return "Homework removed.";
  });
}

export async function saveTicksAction(_p: ActionResult, fd: FormData) {
  return run(async (ctx, i, a) => {
    await saveHomeworkTicks(i, a, ctx.userId, String(fd.get("homeworkId") ?? ""), fd.getAll("done").map(String));
    return "Saved.";
  });
}
