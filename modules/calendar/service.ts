/**
 * PROMPT EDU ERP — Academic Calendar module ("Academic Calendar & Substitution
 * must be another separate Modules" follow-up to the Home page redesign).
 *
 * One table, `calendar_events` (migration 0031): each row is a single event
 * with a start_date and an optional end_date, which is enough to represent a
 * yearly/termly/monthly-scale entry (a term-long "Summer Vacation" is one row
 * spanning weeks; a single "PTM" day has no end_date) without a separate
 * "granularity" concept. Bulk upload (Excel) reuses the existing generic
 * bulk-import engine — see modules/bulk/service.ts's "calendar_events" entity
 * definition, which calls createCalendarEvent() below for every valid row.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export const CALENDAR_EVENT_TYPES = ["holiday", "exam", "meeting", "ptm", "other"] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export interface CalendarEventRecord {
  id: string;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  start_date: string;
  end_date: string | null;
  club_in_charge: string | null;
}

export async function listCalendarEvents(
  institutionId: string, authUserId: string,
  opts?: { from?: string; to?: string }
): Promise<CalendarEventRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.from) { params.push(opts.from); conditions.push(`coalesce(end_date, start_date) >= $${params.length}`); }
    if (opts?.to) { params.push(opts.to); conditions.push(`start_date <= $${params.length}`); }
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await scoped.query<CalendarEventRecord>(
      `select id, title, description, event_type, start_date, end_date, club_in_charge
         from calendar_events ${where}
        order by start_date asc`,
      params
    );
    return rows;
  });
}

/** Home page widget: the next N upcoming (not-yet-finished) events, soonest
 *  first — an event still counts as "upcoming" through its own end_date (a
 *  week-long holiday that started yesterday is still upcoming/ongoing). */
export async function listUpcomingCalendarEvents(
  institutionId: string, authUserId: string, limit = 6
): Promise<CalendarEventRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<CalendarEventRecord>(
      `select id, title, description, event_type, start_date, end_date, club_in_charge
         from calendar_events
        where coalesce(end_date, start_date) >= current_date
        order by start_date asc
        limit $1`,
      [limit]
    );
    return rows;
  });
}

const eventTypeSchema = z.enum(CALENDAR_EVENT_TYPES);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  eventType: eventTypeSchema.default("other"),
  startDate: z.string().regex(DATE_RE, "Must be YYYY-MM-DD."),
  endDate: z.string().regex(DATE_RE, "Must be YYYY-MM-DD.").nullable().optional(),
  // §425 "add clubs in charge for events (may be optional)" — always
  // optional, free text (see migration 0044's own comment for why not a
  // foreign key into a clubs table that doesn't otherwise exist).
  clubInCharge: z.string().max(200).nullable().optional(),
});

export async function createCalendarEvent(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof createEventSchema>,
  scopedClient?: DbClient // §Q.1: passed by bulk import's confirmImport() (modules/bulk/service.ts)
): Promise<CalendarEventRecord> {
  const data = createEventSchema.parse(input);
  if (data.endDate && data.endDate < data.startDate) {
    throw new Error("End date cannot be before start date.");
  }
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<CalendarEventRecord>(
      `insert into calendar_events (institution_id, title, description, event_type, start_date, end_date, club_in_charge, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, title, description, event_type, start_date, end_date, club_in_charge`,
      [
        institutionId, data.title, data.description ?? null, data.eventType, data.startDate, data.endDate ?? null,
        data.clubInCharge ?? null, userId,
      ]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "calendar",
      entityType: "calendar_events", entityId: rows[0].id, after: rows[0],
    });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

const updateEventSchema = createEventSchema.partial().extend({ id: z.string().uuid() });

export async function updateCalendarEvent(
  institutionId: string, authUserId: string, userId: string,
  input: z.infer<typeof updateEventSchema>
): Promise<CalendarEventRecord> {
  const data = updateEventSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<CalendarEventRecord>(
      "select id, title, description, event_type, start_date, end_date, club_in_charge from calendar_events where id = $1",
      [data.id]
    );
    if (!before[0]) throw new Error("Calendar event not found.");
    const merged = {
      title: data.title ?? before[0].title,
      description: data.description !== undefined ? data.description : before[0].description,
      eventType: data.eventType ?? before[0].event_type,
      startDate: data.startDate ?? before[0].start_date,
      endDate: data.endDate !== undefined ? data.endDate : before[0].end_date,
      clubInCharge: data.clubInCharge !== undefined ? data.clubInCharge : before[0].club_in_charge,
    };
    if (merged.endDate && merged.endDate < merged.startDate) {
      throw new Error("End date cannot be before start date.");
    }
    const { rows } = await scoped.query<CalendarEventRecord>(
      `update calendar_events set title = $2, description = $3, event_type = $4, start_date = $5, end_date = $6, club_in_charge = $7, updated_at = now()
        where id = $1
        returning id, title, description, event_type, start_date, end_date, club_in_charge`,
      [data.id, merged.title, merged.description, merged.eventType, merged.startDate, merged.endDate, merged.clubInCharge]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "update", module: "calendar",
      entityType: "calendar_events", entityId: data.id, before: before[0], after: rows[0],
    });
    return rows[0];
  });
}

export async function deleteCalendarEvent(institutionId: string, authUserId: string, userId: string, eventId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<CalendarEventRecord>(
      "select id, title, description, event_type, start_date, end_date, club_in_charge from calendar_events where id = $1",
      [eventId]
    );
    if (!before[0]) return;
    await scoped.query("delete from calendar_events where id = $1", [eventId]);
    await recordAudit(scoped, {
      institutionId, userId, action: "delete", module: "calendar",
      entityType: "calendar_events", entityId: eventId, before: before[0],
    });
  });
}
