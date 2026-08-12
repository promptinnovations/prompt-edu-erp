"use server";

/**
 * PROMPT EDU ERP — notification-read actions, shared between the
 * (institution) admin layout and the (portals) student/parent layout
 * (§Z — a student/parent's notifications work identically to an admin
 * user's, just rendered inside a different shell).
 */
import { requireRequestContext } from "../../services/request-context";
import { markNotificationRead, markAllNotificationsRead } from "../../services/notification/notification-service";

export async function markNotificationReadAction(notificationId: string) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  await markNotificationRead(ctx.institutionId, ctx.session.authUserId, ctx.userId, notificationId);
}

export async function markAllNotificationsReadAction() {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  await markAllNotificationsRead(ctx.institutionId, ctx.session.authUserId, ctx.userId);
}
