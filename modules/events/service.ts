/**
 * PROMPT EDU ERP — Events & Activities module (migration 0070).
 *
 * Houses → events (Arts Fest, Sports Day …) → items (the competitions) →
 * entries (a student, or a team) → judges' marks → results (position,
 * grade, points) → house leader board and individual champions → results in
 * the student / parent portals and the portfolio once the event is
 * published.
 *
 * Event status drives what can happen:
 *   draft             staff build the event and its items;
 *   enrolment_open    staff enrol students; students enrol themselves in
 *                     open individual items they are eligible for;
 *   enrolment_closed  entries are frozen (staff can still fix them);
 *                     judges can start marking;
 *   judging           judges mark; staff see live results;
 *   published         results are computed, frozen and shown in the
 *                     portals; positions / grades go into each student's
 *                     portfolio.
 *
 * Permission checks (events.manage / judge / view / enrol_self) live in the
 * server actions; this service enforces the domain rules (eligibility,
 * limits, judge assignment, status) so they also hold for any other caller.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export const EVENT_KINDS = ["arts", "sports", "academic", "literary", "other"] as const;
export const EVENT_STATUSES = ["draft", "enrolment_open", "enrolment_closed", "judging", "published"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  enrolment_open: "Enrolment open",
  enrolment_closed: "Enrolment closed",
  judging: "Judging",
  published: "Results published",
};

export class EventsError extends Error {}

type Ctx = { institutionId: string; authUserId: string };
async function scopedRun<T>(c: Ctx, fn: (s: DbClient) => Promise<T>): Promise<T> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: c.institutionId, authUserId: c.authUserId }, fn);
}
const num = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

async function currentYearId(s: DbClient): Promise<string> {
  const { rows } = await s.query<{ id: string }>("select id from academic_years where is_current = true limit 1");
  if (!rows[0]) throw new EventsError("Set a current academic year first.");
  return rows[0].id;
}

// ─────────────────────────────────────────────────────────────── Houses ──

export interface HouseRecord { id: string; name: string; color: string; sort_order: number; member_count: number }

export async function listHouses(institutionId: string, authUserId: string): Promise<HouseRecord[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<HouseRecord>(
      `select h.id, h.name, h.color, h.sort_order,
              (select count(*) from student_houses sh
                where sh.house_id = h.id
                  and sh.academic_year_id = (select id from academic_years where is_current = true limit 1))::int as member_count
         from houses h order by h.sort_order, h.name`
    );
    return rows.map((r) => ({ ...r, member_count: num(r.member_count) }));
  });
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.");
export const houseSchema = z.object({
  name: z.string().trim().min(1, "Enter the house name.").max(60),
  color: hexColor,
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export async function createHouse(institutionId: string, authUserId: string, userId: string | null, input: z.infer<typeof houseSchema>) {
  const v = houseSchema.parse(input);
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ id: string }>(
      `insert into houses (institution_id, name, color, sort_order)
       values ($1, $2, $3, coalesce($4, (select coalesce(max(sort_order), 0) + 1 from houses)))
       on conflict (institution_id, name) do nothing returning id`,
      [institutionId, v.name, v.color.toLowerCase(), v.sortOrder ?? null]
    );
    if (!rows[0]) throw new EventsError(`A house called "${v.name}" already exists.`);
    await recordAudit(s, { institutionId, userId, action: "create", module: "events", entityType: "houses", entityId: rows[0].id, after: v });
    return rows[0];
  });
}

export async function updateHouse(institutionId: string, authUserId: string, userId: string | null, houseId: string, input: z.infer<typeof houseSchema>) {
  const v = houseSchema.parse(input);
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ id: string }>(
      `update houses set name = $2, color = $3, sort_order = coalesce($4, sort_order) where id = $1 returning id`,
      [houseId, v.name, v.color.toLowerCase(), v.sortOrder ?? null]
    );
    if (!rows[0]) throw new EventsError("House not found.");
    await recordAudit(s, { institutionId, userId, action: "update", module: "events", entityType: "houses", entityId: houseId, after: v });
  });
}

export async function deleteHouse(institutionId: string, authUserId: string, userId: string | null, houseId: string) {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ n: number }>("select count(*)::int as n from activity_entries where house_id = $1", [houseId]);
    if (num(rows[0]?.n) > 0) throw new EventsError("This house already has event entries — rename it instead of deleting it.");
    await s.query("delete from houses where id = $1", [houseId]);
    await recordAudit(s, { institutionId, userId, action: "delete", module: "events", entityType: "houses", entityId: houseId });
  });
}

export interface StudentHouseRow {
  student_id: string; full_name: string; admission_number: string; gender: string | null;
  class_id: string | null; class_name: string | null; section_name: string | null; stage: string | null;
  house_id: string | null;
}

/** Every active student of the current year with their house (or none). */
export async function listStudentHouses(institutionId: string, authUserId: string): Promise<StudentHouseRow[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<StudentHouseRow>(
      `with y as (select id from academic_years where is_current = true limit 1)
       select st.id as student_id, st.full_name, st.admission_number, st.gender,
              c.id as class_id, c.name as class_name, sec.name as section_name, c.stage, sh.house_id
         from student_enrollments se
         join y on y.id = se.academic_year_id
         join students st on st.id = se.student_id and st.status = 'active'
         join classes c on c.id = se.class_id
         left join sections sec on sec.id = se.section_id
         left join student_houses sh on sh.student_id = st.id and sh.academic_year_id = y.id
        where se.status = 'active'
        order by c.sort_order, c.name, sec.name, se.roll_number nulls last, st.full_name`
    );
    return rows;
  });
}

export async function assignStudentHouses(
  institutionId: string, authUserId: string, userId: string | null,
  assignments: Array<{ studentId: string; houseId: string | null }>
): Promise<number> {
  if (assignments.length === 0) return 0;
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const yearId = await currentYearId(s);
    const clear = assignments.filter((a) => !a.houseId).map((a) => a.studentId);
    const set = assignments.filter((a) => a.houseId) as Array<{ studentId: string; houseId: string }>;
    if (clear.length) {
      await s.query("delete from student_houses where academic_year_id = $1 and student_id = any($2::uuid[])", [yearId, clear]);
    }
    if (set.length) {
      await s.query(
        `insert into student_houses (institution_id, student_id, academic_year_id, house_id)
         select $1, x.sid, $2, x.hid from unnest($3::uuid[], $4::uuid[]) as x(sid, hid)
         on conflict (student_id, academic_year_id) do update set house_id = excluded.house_id`,
        [institutionId, yearId, set.map((a) => a.studentId), set.map((a) => a.houseId)]
      );
    }
    await recordAudit(s, { institutionId, userId, action: "assign_houses", module: "events", entityType: "student_houses", entityId: null, after: { count: assignments.length } });
    return assignments.length;
  });
}

/**
 * Puts every student who has no house yet this year into one, keeping the
 * houses balanced inside each class and, within a class, between boys and
 * girls (the house with the fewest such members gets the next student).
 */
export async function autoAssignHouses(institutionId: string, authUserId: string, userId: string | null): Promise<number> {
  const [houses, roster] = await Promise.all([listHouses(institutionId, authUserId), listStudentHouses(institutionId, authUserId)]);
  if (houses.length === 0) throw new EventsError("Add houses first.");
  const key = (cls: string | null, g: string | null) => `${cls ?? "-"}|${(g ?? "").toLowerCase()}`;
  const perGroup = new Map<string, Map<string, number>>();
  const perClass = new Map<string, Map<string, number>>();
  const total = new Map<string, number>(houses.map((h) => [h.id, 0]));
  const bump = (m: Map<string, Map<string, number>>, k: string, h: string) => {
    const inner = m.get(k) ?? new Map<string, number>();
    inner.set(h, (inner.get(h) ?? 0) + 1); m.set(k, inner);
  };
  for (const r of roster) {
    if (!r.house_id || !total.has(r.house_id)) continue;
    bump(perGroup, key(r.class_id, r.gender), r.house_id);
    bump(perClass, r.class_id ?? "-", r.house_id);
    total.set(r.house_id, (total.get(r.house_id) ?? 0) + 1);
  }
  const out: Array<{ studentId: string; houseId: string }> = [];
  for (const r of roster) {
    if (r.house_id) continue;
    const g = perGroup.get(key(r.class_id, r.gender));
    const c = perClass.get(r.class_id ?? "-");
    const best = [...houses].sort((a, b) =>
      (g?.get(a.id) ?? 0) - (g?.get(b.id) ?? 0) ||
      (c?.get(a.id) ?? 0) - (c?.get(b.id) ?? 0) ||
      (total.get(a.id) ?? 0) - (total.get(b.id) ?? 0) ||
      a.sort_order - b.sort_order
    )[0];
    out.push({ studentId: r.student_id, houseId: best.id });
    bump(perGroup, key(r.class_id, r.gender), best.id);
    bump(perClass, r.class_id ?? "-", best.id);
    total.set(best.id, (total.get(best.id) ?? 0) + 1);
  }
  return assignStudentHouses(institutionId, authUserId, userId, out);
}

export async function getStudentHouse(institutionId: string, authUserId: string, studentId: string): Promise<{ id: string; name: string; color: string } | null> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ id: string; name: string; color: string }>(
      `select h.id, h.name, h.color from student_houses sh join houses h on h.id = sh.house_id
        where sh.student_id = $1 and sh.academic_year_id = (select id from academic_years where is_current = true limit 1)`,
      [studentId]
    );
    return rows[0] ?? null;
  });
}

// ─────────────────────────────────────────────────────────────── Events ──

export interface EventRecord {
  id: string; name: string; kind: string; description: string | null;
  start_date: string | null; end_date: string | null; status: EventStatus;
  max_items_per_student: number | null;
  grade_a_min: number; grade_b_min: number; grade_c_min: number;
  published_at: string | null; item_count: number; entry_count: number;
}

const EVENT_COLS = `e.id, e.name, e.kind, e.description, e.start_date::text as start_date, e.end_date::text as end_date, e.status,
  e.max_items_per_student, e.grade_a_min, e.grade_b_min, e.grade_c_min, e.published_at::text as published_at,
  (select count(*) from activity_items i where i.event_id = e.id)::int as item_count,
  (select count(*) from activity_entries en join activity_items i on i.id = en.item_id
    where i.event_id = e.id and en.status <> 'withdrawn')::int as entry_count`;

function mapEvent(r: EventRecord): EventRecord {
  return {
    ...r,
    max_items_per_student: numOrNull(r.max_items_per_student),
    grade_a_min: num(r.grade_a_min), grade_b_min: num(r.grade_b_min), grade_c_min: num(r.grade_c_min),
    item_count: num(r.item_count), entry_count: num(r.entry_count),
  };
}

/** Events of the current academic year (or every year with `allYears`). */
export async function listEvents(institutionId: string, authUserId: string, opts: { allYears?: boolean; visibleOnly?: boolean } = {}): Promise<EventRecord[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const where: string[] = [];
    if (!opts.allYears) where.push("e.academic_year_id = (select id from academic_years where is_current = true limit 1)");
    if (opts.visibleOnly) where.push("e.status <> 'draft'");
    const { rows } = await s.query<EventRecord>(
      `select ${EVENT_COLS} from activity_events e ${where.length ? `where ${where.join(" and ")}` : ""}
        order by e.start_date desc nulls last, e.created_at desc`
    );
    return rows.map(mapEvent);
  });
}

export async function getEvent(institutionId: string, authUserId: string, eventId: string): Promise<EventRecord | null> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<EventRecord>(`select ${EVENT_COLS} from activity_events e where e.id = $1`, [eventId]);
    return rows[0] ? mapEvent(rows[0]) : null;
  });
}

const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
export const eventSchema = z.object({
  name: z.string().trim().min(1, "Enter the event name.").max(120),
  kind: z.enum(EVENT_KINDS),
  description: z.string().trim().max(2000).nullable().optional(),
  startDate: optDate,
  endDate: optDate,
  maxItemsPerStudent: z.number().int().min(1).max(50).nullable().optional(),
  gradeAMin: z.number().min(0).max(100).optional(),
  gradeBMin: z.number().min(0).max(100).optional(),
  gradeCMin: z.number().min(0).max(100).optional(),
}).refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { message: "The end date is before the start date." })
  .refine((v) => (v.gradeAMin ?? 70) >= (v.gradeBMin ?? 60) && (v.gradeBMin ?? 60) >= (v.gradeCMin ?? 50), { message: "Grade cut-offs must go A ≥ B ≥ C." });

export async function createEvent(institutionId: string, authUserId: string, userId: string | null, input: z.infer<typeof eventSchema>) {
  const v = eventSchema.parse(input);
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const yearId = await currentYearId(s);
    const { rows } = await s.query<{ id: string }>(
      `insert into activity_events (institution_id, academic_year_id, name, kind, description, start_date, end_date,
                                    max_items_per_student, grade_a_min, grade_b_min, grade_c_min, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 70), coalesce($10, 60), coalesce($11, 50), $12) returning id`,
      [institutionId, yearId, v.name, v.kind, v.description ?? null, v.startDate ?? null, v.endDate ?? null,
        v.maxItemsPerStudent ?? null, v.gradeAMin ?? null, v.gradeBMin ?? null, v.gradeCMin ?? null, userId]
    );
    await recordAudit(s, { institutionId, userId, action: "create", module: "events", entityType: "activity_events", entityId: rows[0].id, after: v });
    return rows[0];
  });
}

export async function updateEvent(institutionId: string, authUserId: string, userId: string | null, eventId: string, input: z.infer<typeof eventSchema>) {
  const v = eventSchema.parse(input);
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ id: string }>(
      `update activity_events set name = $2, kind = $3, description = $4, start_date = $5, end_date = $6,
              max_items_per_student = $7, grade_a_min = coalesce($8, grade_a_min), grade_b_min = coalesce($9, grade_b_min),
              grade_c_min = coalesce($10, grade_c_min), updated_at = now()
        where id = $1 returning id`,
      [eventId, v.name, v.kind, v.description ?? null, v.startDate ?? null, v.endDate ?? null, v.maxItemsPerStudent ?? null,
        v.gradeAMin ?? null, v.gradeBMin ?? null, v.gradeCMin ?? null]
    );
    if (!rows[0]) throw new EventsError("Event not found.");
    await recordAudit(s, { institutionId, userId, action: "update", module: "events", entityType: "activity_events", entityId: eventId, after: v });
  });
}

export async function deleteEvent(institutionId: string, authUserId: string, userId: string | null, eventId: string) {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    await s.query(
      `delete from portfolio_events where module = 'events' and entity_type = 'activity_entries'
          and entity_id in (select en.id from activity_entries en join activity_items i on i.id = en.item_id where i.event_id = $1)`,
      [eventId]
    );
    await s.query("delete from activity_events where id = $1", [eventId]);
    await recordAudit(s, { institutionId, userId, action: "delete", module: "events", entityType: "activity_events", entityId: eventId });
  });
}

/**
 * Moves an event to another stage. Publishing computes every item's results,
 * stamps published_at and writes each placed / graded student's result into
 * their portfolio; moving back out of "published" takes those portfolio
 * lines away again (they come back on the next publish).
 */
export async function setEventStatus(institutionId: string, authUserId: string, userId: string | null, eventId: string, status: EventStatus) {
  if (!EVENT_STATUSES.includes(status)) throw new EventsError("Unknown status.");
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ status: EventStatus; name: string }>("select status, name from activity_events where id = $1", [eventId]);
    if (!rows[0]) throw new EventsError("Event not found.");
    const before = rows[0].status;
    if (status === "published") {
      const { rows: items } = await s.query<{ id: string }>("select id from activity_items where event_id = $1", [eventId]);
      for (const it of items) await computeItemResultsIn(s, institutionId, it.id);
    }
    await s.query(
      `update activity_events set status = $2, updated_at = now(),
              published_at = case when $2 = 'published' then now() else null end where id = $1`,
      [eventId, status]
    );
    await s.query(
      `delete from portfolio_events where module = 'events' and entity_type = 'activity_entries'
          and entity_id in (select en.id from activity_entries en join activity_items i on i.id = en.item_id where i.event_id = $1)`,
      [eventId]
    );
    if (status === "published") {
      await s.query(
        `insert into portfolio_events (institution_id, student_id, event_type, module, entity_type, entity_id, event_date, title, description, score, approved_by, status)
         select $1, m.student_id, 'event_result', 'events', 'activity_entries', en.id,
                coalesce(e.end_date, e.start_date, current_date),
                concat_ws(' — ', case r.position when 1 then '1st place' when 2 then '2nd place' when 3 then '3rd place' end,
                          case when r.grade is not null then 'Grade ' || r.grade end) || ': ' || i.name,
                e.name, r.score_pct, $2, 'approved'
           from activity_results r
           join activity_entries en on en.id = r.entry_id
           join activity_items i on i.id = r.item_id
           join activity_events e on e.id = i.event_id
           join activity_entry_members m on m.entry_id = en.id
          where e.id = $3 and (r.position is not null or r.grade is not null)`,
        [institutionId, userId, eventId]
      );
    }
    await recordAudit(s, { institutionId, userId, action: "set_status", module: "events", entityType: "activity_events", entityId: eventId, before: { status: before }, after: { status } });
  });
}

// ──────────────────────────────────────────────────────────────── Items ──

export interface ItemRecord {
  id: string; event_id: string; name: string; category: string | null;
  participation: "individual" | "group"; team_size_max: number | null;
  eligible_class_ids: string[] | null; gender: "male" | "female" | null;
  max_entries_per_house: number | null; criteria: string[]; max_mark_per_criterion: number;
  points_first: number; points_second: number; points_third: number;
  points_grade_a: number; points_grade_b: number; points_grade_c: number;
  sort_order: number; entry_count: number; judge_count: number; scored_count: number;
}

const ITEM_COLS = `i.id, i.event_id, i.name, i.category, i.participation, i.team_size_max, i.eligible_class_ids, i.gender,
  i.max_entries_per_house, i.criteria, i.max_mark_per_criterion, i.points_first, i.points_second, i.points_third,
  i.points_grade_a, i.points_grade_b, i.points_grade_c, i.sort_order,
  (select count(*) from activity_entries en where en.item_id = i.id and en.status = 'enrolled')::int as entry_count,
  (select count(*) from activity_judges j where j.item_id = i.id)::int as judge_count,
  (select count(distinct sc.entry_id) from activity_scores sc join activity_entries en on en.id = sc.entry_id
    where en.item_id = i.id and en.status = 'enrolled')::int as scored_count`;

function mapItem(r: ItemRecord): ItemRecord {
  return {
    ...r,
    team_size_max: numOrNull(r.team_size_max), max_entries_per_house: numOrNull(r.max_entries_per_house),
    eligible_class_ids: r.eligible_class_ids && r.eligible_class_ids.length ? r.eligible_class_ids : null,
    criteria: r.criteria ?? ["Overall"], max_mark_per_criterion: num(r.max_mark_per_criterion),
    points_first: num(r.points_first), points_second: num(r.points_second), points_third: num(r.points_third),
    points_grade_a: num(r.points_grade_a), points_grade_b: num(r.points_grade_b), points_grade_c: num(r.points_grade_c),
    sort_order: num(r.sort_order), entry_count: num(r.entry_count), judge_count: num(r.judge_count), scored_count: num(r.scored_count),
  };
}

export async function listItems(institutionId: string, authUserId: string, eventId: string): Promise<ItemRecord[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<ItemRecord>(`select ${ITEM_COLS} from activity_items i where i.event_id = $1 order by i.sort_order, i.name`, [eventId]);
    return rows.map(mapItem);
  });
}

export async function getItem(institutionId: string, authUserId: string, itemId: string): Promise<ItemRecord | null> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<ItemRecord>(`select ${ITEM_COLS} from activity_items i where i.id = $1`, [itemId]);
    return rows[0] ? mapItem(rows[0]) : null;
  });
}

const pts = z.number().min(0).max(1000);
export const itemSchema = z.object({
  name: z.string().trim().min(1, "Enter the item name.").max(120),
  category: z.string().trim().max(60).nullable().optional(),
  participation: z.enum(["individual", "group"]),
  teamSizeMax: z.number().int().min(2).max(100).nullable().optional(),
  eligibleClassIds: z.array(z.string().uuid()).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  maxEntriesPerHouse: z.number().int().min(1).max(100).nullable().optional(),
  criteria: z.array(z.string().trim().min(1).max(60)).min(1).max(10).optional(),
  maxMarkPerCriterion: z.number().positive().max(1000).optional(),
  pointsFirst: pts.optional(), pointsSecond: pts.optional(), pointsThird: pts.optional(),
  pointsGradeA: pts.optional(), pointsGradeB: pts.optional(), pointsGradeC: pts.optional(),
}).refine((v) => v.participation === "individual" || (v.teamSizeMax ?? 0) >= 2, { message: "Give the largest team size for a group item." });

function itemParams(v: z.infer<typeof itemSchema>) {
  return [
    v.name, v.category ?? null, v.participation, v.participation === "group" ? v.teamSizeMax ?? null : null,
    v.eligibleClassIds && v.eligibleClassIds.length ? v.eligibleClassIds : null, v.gender ?? null, v.maxEntriesPerHouse ?? null,
    v.criteria && v.criteria.length ? v.criteria : ["Overall"], v.maxMarkPerCriterion ?? 10,
    v.pointsFirst ?? 5, v.pointsSecond ?? 3, v.pointsThird ?? 1, v.pointsGradeA ?? 5, v.pointsGradeB ?? 3, v.pointsGradeC ?? 1,
  ];
}

export async function createItem(institutionId: string, authUserId: string, userId: string | null, eventId: string, input: z.infer<typeof itemSchema>) {
  const v = itemSchema.parse(input);
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows: ev } = await s.query<{ status: string }>("select status from activity_events where id = $1", [eventId]);
    if (!ev[0]) throw new EventsError("Event not found.");
    if (ev[0].status === "published") throw new EventsError("Results are published — move the event back to judging to change it.");
    const { rows } = await s.query<{ id: string }>(
      `insert into activity_items (institution_id, event_id, name, category, participation, team_size_max, eligible_class_ids, gender,
                                   max_entries_per_house, criteria, max_mark_per_criterion, points_first, points_second, points_third,
                                   points_grade_a, points_grade_b, points_grade_c, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7::uuid[], $8, $9, $10::text[], $11, $12, $13, $14, $15, $16, $17,
               (select coalesce(max(sort_order), 0) + 1 from activity_items where event_id = $2))
       on conflict (event_id, name) do nothing returning id`,
      [institutionId, eventId, ...itemParams(v)]
    );
    if (!rows[0]) throw new EventsError(`This event already has an item called "${v.name}".`);
    await recordAudit(s, { institutionId, userId, action: "create", module: "events", entityType: "activity_items", entityId: rows[0].id, after: v });
    return rows[0];
  });
}

export async function updateItem(institutionId: string, authUserId: string, userId: string | null, itemId: string, input: z.infer<typeof itemSchema>) {
  const v = itemSchema.parse(input);
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ id: string }>(
      `update activity_items set name = $2, category = $3, participation = $4, team_size_max = $5, eligible_class_ids = $6::uuid[],
              gender = $7, max_entries_per_house = $8, criteria = $9::text[], max_mark_per_criterion = $10, points_first = $11,
              points_second = $12, points_third = $13, points_grade_a = $14, points_grade_b = $15, points_grade_c = $16
        where id = $1 returning id`,
      [itemId, ...itemParams(v)]
    );
    if (!rows[0]) throw new EventsError("Item not found.");
    await recordAudit(s, { institutionId, userId, action: "update", module: "events", entityType: "activity_items", entityId: itemId, after: v });
  });
}

export async function deleteItem(institutionId: string, authUserId: string, userId: string | null, itemId: string) {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    await s.query("delete from activity_items where id = $1", [itemId]);
    await recordAudit(s, { institutionId, userId, action: "delete", module: "events", entityType: "activity_items", entityId: itemId });
  });
}

export async function listItemJudges(institutionId: string, authUserId: string, itemId: string): Promise<Array<{ user_id: string; full_name: string }>> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ user_id: string; full_name: string }>(
      `select j.user_id, u.full_name from activity_judges j join users u on u.id = j.user_id where j.item_id = $1 order by u.full_name`,
      [itemId]
    );
    return rows;
  });
}

export async function setItemJudges(institutionId: string, authUserId: string, userId: string | null, itemId: string, judgeUserIds: string[]) {
  const ids = [...new Set(judgeUserIds)];
  return scopedRun({ institutionId, authUserId }, async (s) => {
    await s.query("delete from activity_judges where item_id = $1 and not (user_id = any($2::uuid[]))", [itemId, ids]);
    if (ids.length) {
      await s.query(
        `insert into activity_judges (institution_id, item_id, user_id) select $1, $2, u from unnest($3::uuid[]) as u on conflict do nothing`,
        [institutionId, itemId, ids]
      );
    }
    await recordAudit(s, { institutionId, userId, action: "set_judges", module: "events", entityType: "activity_items", entityId: itemId, after: { judges: ids } });
  });
}

// ────────────────────────────────────────────────────────────── Entries ──

export interface EntryRecord {
  id: string; item_id: string; entry_no: number; team_name: string | null; status: "enrolled" | "withdrawn" | "absent";
  house_id: string | null; house_name: string | null; house_color: string | null;
  members: Array<{ student_id: string; full_name: string; class_name: string | null; section_name: string | null }>;
  score_pct: number | null; position: number | null; grade: string | null; points: number | null;
}

export async function listEntries(institutionId: string, authUserId: string, itemId: string): Promise<EntryRecord[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<EntryRecord>(
      `select en.id, en.item_id, en.entry_no, en.team_name, en.status, en.house_id, h.name as house_name, h.color as house_color,
              coalesce((select json_agg(json_build_object('student_id', st.id, 'full_name', st.full_name,
                                         'class_name', c.name, 'section_name', sec.name) order by st.full_name)
                          from activity_entry_members m
                          join students st on st.id = m.student_id
                          left join student_enrollments se on se.student_id = st.id and se.status = 'active'
                               and se.academic_year_id = (select id from academic_years where is_current = true limit 1)
                          left join classes c on c.id = se.class_id
                          left join sections sec on sec.id = se.section_id
                         where m.entry_id = en.id), '[]'::json) as members,
              r.score_pct, r.position, r.grade, r.points
         from activity_entries en
         left join houses h on h.id = en.house_id
         left join activity_results r on r.entry_id = en.id
        where en.item_id = $1
        order by en.entry_no`,
      [itemId]
    );
    return rows.map((r) => ({
      ...r,
      entry_no: num(r.entry_no),
      members: typeof r.members === "string" ? JSON.parse(r.members) : r.members,
      score_pct: numOrNull(r.score_pct), position: numOrNull(r.position), points: numOrNull(r.points),
    }));
  });
}

export interface EnrolInput {
  itemId: string;
  studentIds: string[];
  teamName?: string | null;
  /** "staff" = events.manage; "self" = a student enrolling themself. */
  mode: "staff" | "self";
}

/**
 * Enrols one student (individual item) or a team (group item). Checks: the
 * event is taking entries, each member is actively enrolled this year in an
 * eligible class and of the item's gender, is not already in the item and
 * is under the event's item limit; team members share a house; the house is
 * under the item's entry limit. Entry (chest) numbers count up per item.
 */
export async function enrolEntry(institutionId: string, authUserId: string, userId: string | null, input: EnrolInput): Promise<{ id: string; entry_no: number }> {
  const studentIds = [...new Set(input.studentIds.filter(Boolean))];
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows: itemRows } = await s.query<ItemRecord & { event_status: EventStatus; max_items_per_student: number | null; academic_year_id: string }>(
      `select ${ITEM_COLS}, e.status as event_status, e.max_items_per_student, e.academic_year_id
         from activity_items i join activity_events e on e.id = i.event_id where i.id = $1`,
      [input.itemId]
    );
    const raw = itemRows[0];
    if (!raw) throw new EventsError("Item not found.");
    const item = mapItem(raw);
    const status = raw.event_status;
    const maxItems = numOrNull(raw.max_items_per_student);

    if (input.mode === "self") {
      if (status !== "enrolment_open") throw new EventsError("Enrolment for this event is closed.");
      if (item.participation !== "individual") throw new EventsError("Teams for group items are entered by your teachers.");
      if (studentIds.length !== 1) throw new EventsError("You can only enrol yourself.");
    } else if (status === "published") {
      throw new EventsError("Results are published — entries can no longer change.");
    }

    if (item.participation === "individual" && studentIds.length !== 1) throw new EventsError("Pick one student for an individual item.");
    if (item.participation === "group") {
      if (studentIds.length < 1) throw new EventsError("Pick the team members.");
      if (item.team_size_max && studentIds.length > item.team_size_max) throw new EventsError(`A team can have at most ${item.team_size_max} members.`);
    }

    const { rows: members } = await s.query<{
      id: string; full_name: string; gender: string | null; class_id: string | null; house_id: string | null; in_item: boolean; items_in_event: number;
    }>(
      `select st.id, st.full_name, st.gender, se.class_id, sh.house_id,
              exists(select 1 from activity_entry_members m join activity_entries en on en.id = m.entry_id
                      where m.item_id = $2 and m.student_id = st.id and en.status <> 'withdrawn') as in_item,
              (select count(distinct m.item_id) from activity_entry_members m
                 join activity_entries en on en.id = m.entry_id and en.status <> 'withdrawn'
                 join activity_items i2 on i2.id = m.item_id
                where m.student_id = st.id and i2.event_id = $3)::int as items_in_event
         from students st
         left join student_enrollments se on se.student_id = st.id and se.status = 'active' and se.academic_year_id = $4
         left join student_houses sh on sh.student_id = st.id and sh.academic_year_id = $4
        where st.id = any($1::uuid[])`,
      [studentIds, input.itemId, item.event_id, raw.academic_year_id]
    );
    if (members.length !== studentIds.length) throw new EventsError("Student not found.");

    const { rows: hc } = await s.query<{ n: number }>("select count(*)::int as n from houses");
    const hasHouses = num(hc[0]?.n) > 0;

    for (const m of members) {
      if (!m.class_id) throw new EventsError(`${m.full_name} is not enrolled in a class this year.`);
      if (item.eligible_class_ids && !item.eligible_class_ids.includes(m.class_id)) throw new EventsError(`${m.full_name}'s class cannot take part in ${item.name}.`);
      if (item.gender && (m.gender ?? "").toLowerCase() !== item.gender) throw new EventsError(`${item.name} is for ${item.gender === "male" ? "boys" : "girls"} only.`);
      if (m.in_item) throw new EventsError(`${m.full_name} is already entered in ${item.name}.`);
      if (maxItems && num(m.items_in_event) >= maxItems) throw new EventsError(`${m.full_name} has already entered ${maxItems} item${maxItems === 1 ? "" : "s"} — the most allowed in this event.`);
      if (hasHouses && !m.house_id) throw new EventsError(`${m.full_name} has no house yet — assign houses first.`);
    }
    const houseIds = [...new Set(members.map((m) => m.house_id))];
    if (houseIds.length > 1) throw new EventsError("Every member of a team must be from the same house.");
    const houseId = houseIds[0] ?? null;

    if (houseId && item.max_entries_per_house) {
      const { rows: c } = await s.query<{ n: number }>(
        "select count(*)::int as n from activity_entries where item_id = $1 and house_id = $2 and status <> 'withdrawn'",
        [item.id, houseId]
      );
      if (num(c[0]?.n) >= item.max_entries_per_house) {
        throw new EventsError(`This house already has ${item.max_entries_per_house} entr${item.max_entries_per_house === 1 ? "y" : "ies"} in ${item.name}.`);
      }
    }

    const { rows: created } = await s.query<{ id: string; entry_no: number }>(
      `insert into activity_entries (institution_id, item_id, house_id, entry_no, team_name, enrolled_by)
       values ($1, $2, $3, (select coalesce(max(entry_no), 0) + 1 from activity_entries where item_id = $2), $4, $5)
       returning id, entry_no`,
      [institutionId, item.id, houseId, item.participation === "group" ? (input.teamName?.trim() || null) : null, userId]
    );
    const entry = created[0];
    await s.query(
      `insert into activity_entry_members (institution_id, entry_id, item_id, student_id)
       select $1, $2, $3, sid from unnest($4::uuid[]) as sid`,
      [institutionId, entry.id, item.id, studentIds]
    );
    await recordAudit(s, { institutionId, userId, action: "enrol", module: "events", entityType: "activity_entries", entityId: entry.id, after: { itemId: item.id, studentIds, mode: input.mode } });
    return { id: entry.id, entry_no: num(entry.entry_no) };
  });
}

/**
 * Takes an entry out. Before judging the entry is simply removed (the
 * student can be entered again); once judging has started it stays on the
 * score sheet marked "withdrawn". A student can withdraw only their own
 * individual entry, and only while enrolment is open.
 */
export async function withdrawEntry(
  institutionId: string, authUserId: string, userId: string | null, entryId: string,
  mode: "staff" | "self", ownStudentId?: string
) {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ status: EventStatus; participation: string; student_ids: string[] }>(
      `select e.status, i.participation,
              array(select m.student_id from activity_entry_members m where m.entry_id = en.id) as student_ids
         from activity_entries en join activity_items i on i.id = en.item_id join activity_events e on e.id = i.event_id
        where en.id = $1`,
      [entryId]
    );
    const r = rows[0];
    if (!r) throw new EventsError("Entry not found.");
    if (mode === "self") {
      if (r.status !== "enrolment_open") throw new EventsError("Enrolment is closed — ask your teacher.");
      if (r.participation !== "individual" || !ownStudentId || !r.student_ids.includes(ownStudentId)) throw new EventsError("You can only withdraw your own entry.");
    }
    if (r.status === "published") throw new EventsError("Results are published — entries can no longer change.");
    if (r.status === "judging") {
      await s.query("update activity_entries set status = 'withdrawn' where id = $1", [entryId]);
      await s.query("delete from activity_results where entry_id = $1", [entryId]);
    } else {
      await s.query("delete from activity_entries where id = $1", [entryId]);
    }
    await recordAudit(s, { institutionId, userId, action: "withdraw", module: "events", entityType: "activity_entries", entityId: entryId, after: { mode } });
  });
}

export async function setEntryStatus(institutionId: string, authUserId: string, userId: string | null, entryId: string, status: "enrolled" | "absent" | "withdrawn") {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    await s.query("update activity_entries set status = $2 where id = $1", [entryId, status]);
    if (status !== "enrolled") await s.query("delete from activity_results where entry_id = $1", [entryId]);
    await recordAudit(s, { institutionId, userId, action: "set_status", module: "events", entityType: "activity_entries", entityId: entryId, after: { status } });
  });
}

// ───────────────────────────────────────────────────────────── Judging ──

export interface JudgingItem {
  item_id: string; item_name: string; event_id: string; event_name: string; event_status: EventStatus;
  entry_count: number; my_scored: number;
}

/** Items the user is assigned to judge in events that are open for marks. */
export async function listMyJudgingItems(institutionId: string, authUserId: string, userId: string): Promise<JudgingItem[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<JudgingItem>(
      `select i.id as item_id, i.name as item_name, e.id as event_id, e.name as event_name, e.status as event_status,
              (select count(*) from activity_entries en where en.item_id = i.id and en.status = 'enrolled')::int as entry_count,
              (select count(distinct sc.entry_id) from activity_scores sc join activity_entries en on en.id = sc.entry_id
                where en.item_id = i.id and sc.judge_user_id = $1)::int as my_scored
         from activity_judges j
         join activity_items i on i.id = j.item_id
         join activity_events e on e.id = i.event_id
        where j.user_id = $1 and e.status in ('enrolment_closed', 'judging')
        order by e.name, i.sort_order, i.name`,
      [userId]
    );
    return rows.map((r) => ({ ...r, entry_count: num(r.entry_count), my_scored: num(r.my_scored) }));
  });
}

export interface ScoreSheet {
  item: ItemRecord; event_status: EventStatus; is_judge: boolean;
  entries: Array<{ id: string; entry_no: number; team_name: string | null; marks: Record<string, number> }>;
}

/**
 * A judge's sheet: entry (chest) numbers and team names only — judges mark
 * the performance, not the name. Marks shown are the requesting judge's own.
 */
export async function getScoreSheet(institutionId: string, authUserId: string, userId: string, itemId: string): Promise<ScoreSheet | null> {
  const item = await getItem(institutionId, authUserId, itemId);
  if (!item) return null;
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows: ev } = await s.query<{ status: EventStatus; is_judge: boolean }>(
      `select e.status, exists(select 1 from activity_judges j where j.item_id = $1 and j.user_id = $2) as is_judge
         from activity_events e where e.id = $3`,
      [itemId, userId, item.event_id]
    );
    const { rows } = await s.query<{ id: string; entry_no: number; team_name: string | null; criterion: string | null; mark: number | null }>(
      `select en.id, en.entry_no, en.team_name, sc.criterion, sc.mark
         from activity_entries en
         left join activity_scores sc on sc.entry_id = en.id and sc.judge_user_id = $2
        where en.item_id = $1 and en.status = 'enrolled'
        order by en.entry_no`,
      [itemId, userId]
    );
    const map = new Map<string, ScoreSheet["entries"][number]>();
    for (const r of rows) {
      const e = map.get(r.id) ?? { id: r.id, entry_no: num(r.entry_no), team_name: r.team_name, marks: {} };
      if (r.criterion) e.marks[r.criterion] = num(r.mark);
      map.set(r.id, e);
    }
    return { item, event_status: ev[0]?.status ?? "draft", is_judge: Boolean(ev[0]?.is_judge), entries: [...map.values()] };
  });
}

/** Saves one judge's marks for an item: `marks[entryId][criterion] = mark`
 *  (a blank removes that mark). Assigned judges only, or a manager. */
export async function saveScores(
  institutionId: string, authUserId: string, userId: string, itemId: string,
  marks: Record<string, Record<string, number | null>>, opts: { canManage: boolean }
): Promise<number> {
  const item = await getItem(institutionId, authUserId, itemId);
  if (!item) throw new EventsError("Item not found.");
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows: ev } = await s.query<{ status: EventStatus; is_judge: boolean }>(
      `select e.status, exists(select 1 from activity_judges j where j.item_id = $1 and j.user_id = $2) as is_judge
         from activity_events e where e.id = $3`,
      [itemId, userId, item.event_id]
    );
    if (!ev[0]?.is_judge && !opts.canManage) throw new EventsError("You are not a judge for this item.");
    if (!["enrolment_closed", "judging"].includes(ev[0]?.status ?? "")) throw new EventsError("Marks can be entered only after enrolment closes and before results are published.");
    const { rows: valid } = await s.query<{ id: string }>("select id from activity_entries where item_id = $1 and status = 'enrolled'", [itemId]);
    const validIds = new Set(valid.map((v) => v.id));
    const ent: string[] = [], crit: string[] = [], mk: number[] = [];
    const del: Array<[string, string]> = [];
    for (const [entryId, byCrit] of Object.entries(marks)) {
      if (!validIds.has(entryId)) continue;
      for (const [criterion, mark] of Object.entries(byCrit)) {
        if (!item.criteria.includes(criterion)) continue;
        if (mark === null || Number.isNaN(mark)) { del.push([entryId, criterion]); continue; }
        if (mark < 0 || mark > item.max_mark_per_criterion) throw new EventsError(`Marks must be between 0 and ${item.max_mark_per_criterion}.`);
        ent.push(entryId); crit.push(criterion); mk.push(mark);
      }
    }
    if (ent.length) {
      await s.query(
        `insert into activity_scores (institution_id, entry_id, judge_user_id, criterion, mark)
         select $1, x.e, $2, x.c, x.m from unnest($3::uuid[], $4::text[], $5::numeric[]) as x(e, c, m)
         on conflict (entry_id, judge_user_id, criterion) do update set mark = excluded.mark, updated_at = now()`,
        [institutionId, userId, ent, crit, mk]
      );
    }
    if (del.length) {
      await s.query(
        `delete from activity_scores sc using unnest($2::uuid[], $3::text[]) as x(e, c)
          where sc.entry_id = x.e and sc.criterion = x.c and sc.judge_user_id = $1`,
        [userId, del.map((d) => d[0]), del.map((d) => d[1])]
      );
    }
    if (ev[0].status === "enrolment_closed" && ent.length) {
      await s.query("update activity_events set status = 'judging', updated_at = now() where id = $1", [item.event_id]);
    }
    await computeItemResultsIn(s, institutionId, itemId);
    await recordAudit(s, { institutionId, userId, action: "save_scores", module: "events", entityType: "activity_items", entityId: itemId, after: { marks: ent.length, cleared: del.length } });
    return ent.length;
  });
}

// ───────────────────────────────────────────────────────────── Results ──

/** Pure: ranks scored entries. Each entry's score is the average of its
 *  judges' totals as a percentage of the full mark; the top three distinct
 *  scores take 1st/2nd/3rd (equal scores share a place); grades come from
 *  the event's cut-offs; points = place points + grade points. */
export function rankEntries(
  scored: Array<{ entryId: string; pct: number }>,
  cut: { a: number; b: number; c: number },
  p: { first: number; second: number; third: number; a: number; b: number; c: number }
): Array<{ entryId: string; pct: number; position: number | null; grade: "A" | "B" | "C" | null; points: number }> {
  const distinct = [...new Set(scored.map((x) => Math.round(x.pct * 100) / 100))].sort((a, b) => b - a);
  return scored.map((x) => {
    const pct = Math.round(x.pct * 100) / 100;
    const rank = distinct.indexOf(pct) + 1;
    const position = pct > 0 && rank <= 3 ? rank : null;
    const grade = pct >= cut.a ? "A" : pct >= cut.b ? "B" : pct >= cut.c ? "C" : null;
    const points =
      (position === 1 ? p.first : position === 2 ? p.second : position === 3 ? p.third : 0) +
      (grade === "A" ? p.a : grade === "B" ? p.b : grade === "C" ? p.c : 0);
    return { entryId: x.entryId, pct, position, grade, points };
  });
}

async function computeItemResultsIn(s: DbClient, institutionId: string, itemId: string) {
  const { rows: meta } = await s.query<{
    criteria: string[]; max_mark_per_criterion: number; points_first: number; points_second: number; points_third: number;
    points_grade_a: number; points_grade_b: number; points_grade_c: number; grade_a_min: number; grade_b_min: number; grade_c_min: number;
  }>(
    `select i.criteria, i.max_mark_per_criterion, i.points_first, i.points_second, i.points_third,
            i.points_grade_a, i.points_grade_b, i.points_grade_c, e.grade_a_min, e.grade_b_min, e.grade_c_min
       from activity_items i join activity_events e on e.id = i.event_id where i.id = $1`,
    [itemId]
  );
  const m = meta[0];
  if (!m) return;
  const full = (m.criteria?.length || 1) * num(m.max_mark_per_criterion);
  const { rows } = await s.query<{ entry_id: string; avg_total: number }>(
    `select t.entry_id, avg(t.total) as avg_total
       from (select sc.entry_id, sc.judge_user_id, sum(sc.mark) as total
               from activity_scores sc join activity_entries en on en.id = sc.entry_id
              where en.item_id = $1 and en.status = 'enrolled' and sc.criterion = any($2::text[])
              group by sc.entry_id, sc.judge_user_id) t
      group by t.entry_id`,
    [itemId, m.criteria]
  );
  const ranked = rankEntries(
    rows.map((r) => ({ entryId: r.entry_id, pct: full > 0 ? (num(r.avg_total) / full) * 100 : 0 })),
    { a: num(m.grade_a_min), b: num(m.grade_b_min), c: num(m.grade_c_min) },
    { first: num(m.points_first), second: num(m.points_second), third: num(m.points_third), a: num(m.points_grade_a), b: num(m.points_grade_b), c: num(m.points_grade_c) }
  );
  await s.query("delete from activity_results where item_id = $1", [itemId]);
  if (ranked.length) {
    await s.query(
      `insert into activity_results (institution_id, item_id, entry_id, score_pct, position, grade, points)
       select $1, $2, x.e, x.p, x.pos, x.g, x.pts
         from unnest($3::uuid[], $4::numeric[], $5::int[], $6::text[], $7::numeric[]) as x(e, p, pos, g, pts)`,
      [institutionId, itemId, ranked.map((r) => r.entryId), ranked.map((r) => r.pct), ranked.map((r) => r.position),
        ranked.map((r) => r.grade), ranked.map((r) => r.points)]
    );
  }
}

export async function computeItemResults(institutionId: string, authUserId: string, itemId: string) {
  return scopedRun({ institutionId, authUserId }, (s) => computeItemResultsIn(s, institutionId, itemId));
}

export interface HouseStanding { house_id: string; name: string; color: string; points: number; firsts: number; seconds: number; thirds: number }

/**
 * House leader board: total points per house from one event, or (without
 * an event) from every event of the current year. `publishedOnly` limits it
 * to events whose results are out — what students and parents see.
 */
export async function getHouseLeaderboard(
  institutionId: string, authUserId: string, opts: { eventId?: string; publishedOnly?: boolean } = {}
): Promise<HouseStanding[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const params: unknown[] = [];
    const conds = ["true"];
    if (opts.eventId) { params.push(opts.eventId); conds.push(`e.id = $${params.length}`); }
    else conds.push("e.academic_year_id = (select id from academic_years where is_current = true limit 1)");
    if (opts.publishedOnly) conds.push("e.status = 'published'");
    const { rows } = await s.query<HouseStanding>(
      `select h.id as house_id, h.name, h.color,
              coalesce(sum(x.points), 0) as points,
              count(*) filter (where x.position = 1)::int as firsts,
              count(*) filter (where x.position = 2)::int as seconds,
              count(*) filter (where x.position = 3)::int as thirds
         from houses h
         left join (select en.house_id, r.points, r.position
                      from activity_results r
                      join activity_entries en on en.id = r.entry_id and en.status = 'enrolled'
                      join activity_items i on i.id = r.item_id
                      join activity_events e on e.id = i.event_id
                     where ${conds.join(" and ")}) x on x.house_id = h.id
        group by h.id, h.name, h.color, h.sort_order
        order by coalesce(sum(x.points), 0) desc, h.sort_order, h.name`,
      params
    );
    return rows.map((r) => ({ ...r, points: num(r.points), firsts: num(r.firsts), seconds: num(r.seconds), thirds: num(r.thirds) }));
  });
}

export interface ChampionRow {
  student_id: string; full_name: string; class_name: string | null; stage: string | null; gender: string | null;
  house_name: string | null; house_color: string | null; points: number; firsts: number;
}

/**
 * Individual championship: each student's points from INDIVIDUAL items of
 * the event. Returns the full ranked list; the page groups it overall, per
 * stage and boys / girls.
 */
export async function getChampions(institutionId: string, authUserId: string, eventId: string): Promise<ChampionRow[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<ChampionRow>(
      `select st.id as student_id, st.full_name, c.name as class_name, c.stage, lower(st.gender) as gender,
              h.name as house_name, h.color as house_color,
              sum(r.points) as points, count(*) filter (where r.position = 1)::int as firsts
         from activity_results r
         join activity_items i on i.id = r.item_id and i.participation = 'individual'
         join activity_events e on e.id = i.event_id
         join activity_entries en on en.id = r.entry_id and en.status = 'enrolled'
         join activity_entry_members m on m.entry_id = en.id
         join students st on st.id = m.student_id
         left join houses h on h.id = en.house_id
         left join student_enrollments se on se.student_id = st.id and se.status = 'active' and se.academic_year_id = e.academic_year_id
         left join classes c on c.id = se.class_id
        where e.id = $1
        group by st.id, st.full_name, c.name, c.stage, st.gender, h.name, h.color
       having sum(r.points) > 0
        order by sum(r.points) desc, count(*) filter (where r.position = 1) desc, st.full_name`,
      [eventId]
    );
    return rows.map((r) => ({ ...r, points: num(r.points), firsts: num(r.firsts) }));
  });
}

/** Groups a champion list: overall, per stage and per gender (top 3 each,
 *  ties on points included). Pure. */
export function groupChampions(rows: ChampionRow[]) {
  const top = (list: ChampionRow[]) => {
    if (list.length === 0) return [];
    const cutoff = list[Math.min(2, list.length - 1)].points;
    return list.filter((r) => r.points >= cutoff && r.points > 0);
  };
  const stages = [...new Set(rows.map((r) => r.stage).filter(Boolean))] as string[];
  return {
    overall: top(rows),
    boys: top(rows.filter((r) => r.gender === "male")),
    girls: top(rows.filter((r) => r.gender === "female")),
    byStage: stages.map((stage) => ({ stage, rows: top(rows.filter((r) => r.stage === stage)) })),
  };
}

// ─────────────────────────────────────────────────────── Portal views ──

export interface StudentEventsView {
  house: { id: string; name: string; color: string } | null;
  events: Array<EventRecord & {
    openItems: Array<ItemRecord & { enrolled_entry_id: string | null }>;
    myEntries: Array<{
      entry_id: string; item_id: string; item_name: string; participation: string; entry_no: number; team_name: string | null;
      status: string; position: number | null; grade: string | null; points: number | null;
    }>;
  }>;
  standings: HouseStanding[];
}

/**
 * Everything the student / parent portal shows: the student's house, the
 * year's non-draft events with the items they may still enter (when
 * enrolment is open), their own entries (with results only after the event
 * is published) and the house standings from published events.
 */
export async function getStudentEventsView(institutionId: string, authUserId: string, studentId: string): Promise<StudentEventsView> {
  const [house, events, standings] = await Promise.all([
    getStudentHouse(institutionId, authUserId, studentId),
    listEvents(institutionId, authUserId, { visibleOnly: true }),
    getHouseLeaderboard(institutionId, authUserId, { publishedOnly: true }),
  ]);
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows: me } = await s.query<{ class_id: string | null; gender: string | null }>(
      `select se.class_id, lower(st.gender) as gender from students st
         left join student_enrollments se on se.student_id = st.id and se.status = 'active'
              and se.academic_year_id = (select id from academic_years where is_current = true limit 1)
        where st.id = $1`,
      [studentId]
    );
    const classId = me[0]?.class_id ?? null;
    const gender = me[0]?.gender ?? null;
    const eventIds = events.map((e) => e.id);
    const { rows: entries } = eventIds.length ? await s.query<StudentEventsView["events"][number]["myEntries"][number] & { event_id: string }>(
      `select en.id as entry_id, i.id as item_id, i.name as item_name, i.participation, en.entry_no, en.team_name, en.status, i.event_id,
              case when e.status = 'published' then r.position end as position,
              case when e.status = 'published' then r.grade end as grade,
              case when e.status = 'published' then r.points end as points
         from activity_entry_members m
         join activity_entries en on en.id = m.entry_id
         join activity_items i on i.id = en.item_id
         join activity_events e on e.id = i.event_id
         left join activity_results r on r.entry_id = en.id
        where m.student_id = $1 and e.id = any($2::uuid[])
        order by i.sort_order, i.name`,
      [studentId, eventIds]
    ) : { rows: [] };
    const openEventIds = events.filter((e) => e.status === "enrolment_open").map((e) => e.id);
    const { rows: items } = openEventIds.length ? await s.query<ItemRecord>(
      `select ${ITEM_COLS} from activity_items i
        where i.event_id = any($1::uuid[]) and i.participation = 'individual'
          and (i.eligible_class_ids is null or cardinality(i.eligible_class_ids) = 0 or $2::uuid = any(i.eligible_class_ids))
          and (i.gender is null or i.gender = $3)
        order by i.sort_order, i.name`,
      [openEventIds, classId, gender]
    ) : { rows: [] };
    return {
      house,
      standings,
      events: events.map((e) => {
        const mine = entries.filter((x) => x.event_id === e.id).map((x) => ({
          ...x, entry_no: num(x.entry_no), position: numOrNull(x.position), points: numOrNull(x.points),
        }));
        return {
          ...e,
          myEntries: mine,
          openItems: classId ? items.filter((i) => i.event_id === e.id).map(mapItem).map((i) => ({
            ...i, enrolled_entry_id: mine.find((x) => x.item_id === i.id)?.entry_id ?? null,
          })) : [],
        };
      }),
    };
  });
}

export interface StudentEventResult {
  event_id: string; event_name: string; event_kind: string; event_date: string | null; academic_year_id: string;
  item_name: string; participation: string; team_name: string | null; house_name: string | null; house_color: string | null;
  position: number | null; grade: string | null; points: number | null; score_pct: number | null;
}

/**
 * Every PUBLISHED event result of one student, all years, newest first —
 * for the student's profile (staff), the Learner Record and the portfolio
 * ("results of events must be added to student profiles").
 */
export async function listStudentEventResults(institutionId: string, authUserId: string, studentId: string): Promise<StudentEventResult[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<StudentEventResult>(
      `select e.id as event_id, e.name as event_name, e.kind as event_kind,
              coalesce(e.end_date, e.start_date)::text as event_date, e.academic_year_id,
              i.name as item_name, i.participation, en.team_name, h.name as house_name, h.color as house_color,
              r.position, r.grade, r.points, r.score_pct
         from activity_entry_members m
         join activity_entries en on en.id = m.entry_id and en.status = 'enrolled'
         join activity_items i on i.id = en.item_id
         join activity_events e on e.id = i.event_id and e.status = 'published'
         left join activity_results r on r.entry_id = en.id
         left join houses h on h.id = en.house_id
        where m.student_id = $1
        order by coalesce(e.end_date, e.start_date) desc nulls last, e.name, r.position nulls last, i.name`,
      [studentId]
    );
    return rows.map((r) => ({ ...r, position: numOrNull(r.position), points: numOrNull(r.points), score_pct: numOrNull(r.score_pct) }));
  });
}
