"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { replyToParentMessage, markMessageRead } from "../../../modules/communication/service";

/** okAt: a fresh Date.now() on every successful reply -- MessageRow's
 *  ReplyForm watches this (rather than just `!error`) to only close the
 *  reply box and show "Reply sent" once the action has actually
 *  succeeded, instead of on every form submit regardless of outcome
 *  (§495 "check if there is any bug in Message button" fix). */
export async function replyToParentMessageAction(_prevState: { error: string | null; okAt?: number }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "messages.view");
    await replyToParentMessage(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      messageId: String(formData.get("messageId") ?? ""),
      replyText: String(formData.get("replyText") ?? ""),
    });
    revalidatePath("/messages");
    return { error: null, okAt: Date.now() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send reply." };
  }
}

export async function markMessageReadAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "messages.view");
    await markMessageRead(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("messageId") ?? ""));
    revalidatePath("/messages");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to mark as read." };
  }
}
