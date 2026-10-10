"use server";

/** §Attendance-register follow-up ("in monthly register or in attendance,
 *  there should be an option for marking holidays") — rather than inventing
 *  a second, parallel "holiday" concept just for this page, this reuses the
 *  Academic Calendar's existing `calendar_events` (event_type "holiday";
 *  see modules/calendar/service.ts, migration 0031) — the Monthly Register
 *  reads the same table to shade non-working days and compute "Total
 *  working days". A single click here creates a single-day holiday event
 *  (startDate === endDate) so it can be toggled back off from this page;
 *  multi-day holidays (e.g. a week-long vacation) are still created from
 *  the Academic Calendar page and only ever displayed, never toggled, here.
 *  Gated on `calendar.manage` — the same permission the Calendar page
 *  itself requires to write calendar_events — not `attendance.edit`, since
 *  marking a holiday changes institution-wide calendar data, not just this
 *  class/section's attendance. */
import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents } from "../../../../modules/calendar/service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function toggleRegisterHolidayAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const date = String(formData.get("date") ?? "");
  if (!DATE_RE.test(date)) return { error: "Invalid date." };
  try {
    requirePermission(ctx.permissions, "calendar.manage");
    // Toggle off only an exact single-day holiday this control itself could
    // have created (start_date === end_date === date) — a multi-day
    // holiday that happens to cover `date` is left alone and this becomes a
    // no-op "mark holiday" is blocked below by the caller re-checking first.
    const existing = await listCalendarEvents(ctx.institutionId, ctx.session.authUserId, { from: date, to: date });
    const singleDayMatch = existing.find((e) => e.event_type === "holiday" && e.start_date === date && (e.end_date === null || e.end_date === date));
    if (singleDayMatch) {
      await deleteCalendarEvent(ctx.institutionId, ctx.session.authUserId, ctx.userId, singleDayMatch.id);
    } else {
      await createCalendarEvent(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
        title: "Holiday", eventType: "holiday", startDate: date, endDate: date,
      });
    }
    revalidatePath("/attendance/register");
    revalidatePath("/calendar");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update holiday." };
  }
}
