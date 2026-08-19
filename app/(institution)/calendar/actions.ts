"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { createCalendarEvent, deleteCalendarEvent, CALENDAR_EVENT_TYPES } from "../../../modules/calendar/service";

const EVENT_TYPE_SET = new Set<string>(CALENDAR_EVENT_TYPES);

export async function createCalendarEventAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "calendar.manage");
    const eventTypeRaw = String(formData.get("eventType") ?? "other");
    const eventType = EVENT_TYPE_SET.has(eventTypeRaw) ? (eventTypeRaw as (typeof CALENDAR_EVENT_TYPES)[number]) : "other";
    const endDateRaw = String(formData.get("endDate") ?? "").trim();
    await createCalendarEvent(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "").trim() || null,
      eventType,
      startDate: String(formData.get("startDate") ?? ""),
      endDate: endDateRaw || null,
    });
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add calendar event." };
  }
}

export async function deleteCalendarEventAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "calendar.manage");
    const eventId = String(formData.get("eventId") ?? "");
    await deleteCalendarEvent(ctx.institutionId, ctx.session.authUserId, ctx.userId, eventId);
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete calendar event." };
  }
}
