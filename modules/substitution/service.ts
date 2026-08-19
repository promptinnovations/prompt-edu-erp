/**
 * PROMPT EDU ERP — Substitution module ("Substitution is sub arrangement for
 * absent teachers — timetable will be uploaded, arrange free teachers for
 * the engaged classes of the absent teacher... once name of the absent
 * teacher is given, system should generate appropriate subs... editable,
 * regeneratable... a substitution record kept where confirmed sub will be
 * kept, weekly, monthly reportable").
 *
 * Two tables (migration 0031):
 * - timetable_periods: the institution's weekly grid (class+section+
 *   day_of_week+period_no -> subject+teacher) — "institutional
 *   configurations... added by their admins" — an institution's own data,
 *   editable one row at a time here or bulk-uploaded via the generic
 *   bulk-import engine (modules/bulk/service.ts's "timetable_periods"
 *   entity). No exact clock times are stored — day_of_week+period_no is all
 *   the matcher below needs.
 * - staff_substitutions: the CONFIRMED record — never the suggestion itself.
 *   generateSubstitutionSuggestions() below computes suggestions purely
 *   in-memory from timetable_periods (nothing written yet); an admin
 *   reviews/edits them in the UI, then confirmSubstitutions() UPSERTs the
 *   (possibly-edited) rows here — "editable, regeneratable" is just calling
 *   generate again and/or overriding a row before confirming; re-confirming
 *   the same date/class/section/period overwrites via ON CONFLICT, so
 *   there's never a duplicate/stale row for one slot.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** JS Date.getDay() is 0=Sunday..6=Saturday; timetable_periods.day_of_week
 *  is ISO 8601 (1=Monday..7=Sunday) so a plain human "which weekday is this
 *  date" reads naturally in every query/report below. */
export function isoDayOfWeek(dateStr: string): number {
  const jsDay = new Date(`${dateStr}T00:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---------------------------------------------------------------------------
// Timetable (institution configuration)
// ---------------------------------------------------------------------------
export interface TimetablePeriodRow {
  id: string;
  classId: string; className: string;
  sectionId: string; sectionName: string;
  dayOfWeek: number; periodNo: number;
  subjectId: string | null; subjectName: string | null;
  teacherStaffId: string | null; teacherName: string | null;
}

export async function listTimetable(
  institutionId: string, authUserId: string,
  opts?: { classId?: string; sectionId?: string; dayOfWeek?: number }
): Promise<TimetablePeriodRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.classId) { params.push(opts.classId); conditions.push(`tp.class_id = $${params.length}`); }
    if (opts?.sectionId) { params.push(opts.sectionId); conditions.push(`tp.section_id = $${params.length}`); }
    if (opts?.dayOfWeek) { params.push(opts.dayOfWeek); conditions.push(`tp.day_of_week = $${params.length}`); }
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await scoped.query<{
      id: string; class_id: string; class_name: string; section_id: string; section_name: string;
      day_of_week: number; period_no: number; subject_id: string | null; subject_name: string | null;
      teacher_staff_id: string | null; teacher_name: string | null;
    }>(
      `select tp.id, tp.class_id, c.name as class_name, tp.section_id, sec.name as section_name,
              tp.day_of_week, tp.period_no, tp.subject_id, sub.name as subject_name,
              tp.teacher_staff_id, u.full_name as teacher_name
         from timetable_periods tp
         join classes c on c.id = tp.class_id
         join sections sec on sec.id = tp.section_id
         left join subjects sub on sub.id = tp.subject_id
         left join staff st on st.id = tp.teacher_staff_id
         left join users u on u.id = st.user_id
         ${where}
        order by c.sort_order, sec.name, tp.day_of_week, tp.period_no`,
      params
    );
    return rows.map((r) => ({
      id: r.id, classId: r.class_id, className: r.class_name, sectionId: r.section_id, sectionName: r.section_name,
      dayOfWeek: r.day_of_week, periodNo: r.period_no, subjectId: r.subject_id, subjectName: r.subject_name,
      teacherStaffId: r.teacher_staff_id, teacherName: r.teacher_name,
    }));
  });
}

const upsertPeriodSchema = z.object({
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  dayOfWeek: z.number().int().min(1).max(7),
  periodNo: z.number().int().min(1).max(20),
  subjectId: z.string().uuid().nullable().optional(),
  teacherStaffId: z.string().uuid().nullable().optional(),
});

export async function upsertTimetablePeriod(
  institutionId: string, authUserId: string, userId: string,
  input: z.infer<typeof upsertPeriodSchema>,
  scopedClient?: DbClient // §Q.1: passed by bulk import's confirmImport()
): Promise<string> {
  const data = upsertPeriodSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into timetable_periods (institution_id, class_id, section_id, day_of_week, period_no, subject_id, teacher_staff_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (institution_id, class_id, section_id, day_of_week, period_no)
       do update set subject_id = excluded.subject_id, teacher_staff_id = excluded.teacher_staff_id, updated_at = now()
       returning id`,
      [institutionId, data.classId, data.sectionId, data.dayOfWeek, data.periodNo, data.subjectId ?? null, data.teacherStaffId ?? null]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "upsert", module: "substitution",
      entityType: "timetable_periods", entityId: rows[0].id, after: data,
    });
    return rows[0].id;
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

export async function deleteTimetablePeriod(institutionId: string, authUserId: string, userId: string, periodId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ id: string }>("select id from timetable_periods where id = $1", [periodId]);
    if (!before[0]) return;
    await scoped.query("delete from timetable_periods where id = $1", [periodId]);
    await recordAudit(scoped, {
      institutionId, userId, action: "delete", module: "substitution", entityType: "timetable_periods", entityId: periodId,
    });
  });
}

// ---------------------------------------------------------------------------
// Auto-substitution matching (suggestions — computed, never persisted here)
// ---------------------------------------------------------------------------
export interface SubstitutionSuggestion {
  classId: string; className: string;
  sectionId: string; sectionName: string;
  periodNo: number;
  subjectId: string | null; subjectName: string | null;
  suggestedCoveringStaffId: string | null; suggestedCoveringStaffName: string | null;
  freeStaffOptions: Array<{ id: string; name: string }>;
}

/** For every period the given teacher is engaged in on that date's weekday,
 *  suggest ONE free teacher (someone with no class of their own at that same
 *  day_of_week+period_no, excluding the absent teacher) — plus the FULL list
 *  of free options, so the review UI can offer a dropdown instead of only
 *  the top pick ("editable" — an admin isn't stuck with the auto choice).
 *  Nothing is written to the database; see confirmSubstitutions() for that. */
export async function generateSubstitutionSuggestions(
  institutionId: string, authUserId: string, absentStaffId: string, date: string
): Promise<SubstitutionSuggestion[]> {
  const dayOfWeek = isoDayOfWeek(date);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: engaged } = await scoped.query<{
      class_id: string; class_name: string; section_id: string; section_name: string;
      period_no: number; subject_id: string | null; subject_name: string | null;
    }>(
      `select tp.class_id, c.name as class_name, tp.section_id, sec.name as section_name,
              tp.period_no, tp.subject_id, sub.name as subject_name
         from timetable_periods tp
         join classes c on c.id = tp.class_id
         join sections sec on sec.id = tp.section_id
         left join subjects sub on sub.id = tp.subject_id
        where tp.teacher_staff_id = $1 and tp.day_of_week = $2
        order by tp.period_no`,
      [absentStaffId, dayOfWeek]
    );
    if (engaged.length === 0) return [];

    const { rows: allSlots } = await scoped.query<{ period_no: number; teacher_staff_id: string | null }>(
      `select period_no, teacher_staff_id from timetable_periods where day_of_week = $1`,
      [dayOfWeek]
    );
    const busyByPeriod = new Map<number, Set<string>>();
    for (const r of allSlots) {
      if (!r.teacher_staff_id) continue;
      if (!busyByPeriod.has(r.period_no)) busyByPeriod.set(r.period_no, new Set());
      busyByPeriod.get(r.period_no)!.add(r.teacher_staff_id);
    }

    // Candidate pool: any active staff member who teaches at least one
    // period anywhere in the timetable (i.e. is a "teacher", not just any
    // staff member — a librarian or accountant shouldn't be suggested).
    const { rows: teacherRows } = await scoped.query<{ id: string; full_name: string }>(
      `select distinct s.id, u.full_name
         from staff s
         join users u on u.id = s.user_id
         join timetable_periods tp on tp.teacher_staff_id = s.id
        where s.employment_status = 'active'
        order by u.full_name`
    );

    const usedThisRun = new Set<string>(); // "period:teacherId" — never suggest the same substitute for two different classes at the identical slot in one generation pass
    return engaged.map((e) => {
      const busy = busyByPeriod.get(e.period_no) ?? new Set<string>();
      const free = teacherRows.filter(
        (t) => t.id !== absentStaffId && !busy.has(t.id) && !usedThisRun.has(`${e.period_no}:${t.id}`)
      );
      const suggested = free[0] ?? null;
      if (suggested) usedThisRun.add(`${e.period_no}:${suggested.id}`);
      return {
        classId: e.class_id, className: e.class_name, sectionId: e.section_id, sectionName: e.section_name,
        periodNo: e.period_no, subjectId: e.subject_id, subjectName: e.subject_name,
        suggestedCoveringStaffId: suggested?.id ?? null, suggestedCoveringStaffName: suggested?.full_name ?? null,
        freeStaffOptions: free.map((t) => ({ id: t.id, name: t.full_name })),
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Confirmed record
// ---------------------------------------------------------------------------
export interface SubstitutionRow {
  id: string;
  date: string; periodNo: number;
  classId: string; className: string;
  sectionId: string; sectionName: string;
  subjectId: string | null; subjectName: string | null;
  absentStaffId: string; absentStaffName: string;
  coveringStaffId: string | null; coveringStaffName: string | null;
  note: string | null;
}

export async function listSubstitutions(
  institutionId: string, authUserId: string,
  opts?: { from?: string; to?: string; coveringStaffId?: string; absentStaffId?: string }
): Promise<SubstitutionRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.from) { params.push(opts.from); conditions.push(`ss.date >= $${params.length}`); }
    if (opts?.to) { params.push(opts.to); conditions.push(`ss.date <= $${params.length}`); }
    if (opts?.coveringStaffId) { params.push(opts.coveringStaffId); conditions.push(`ss.covering_staff_id = $${params.length}`); }
    if (opts?.absentStaffId) { params.push(opts.absentStaffId); conditions.push(`ss.absent_staff_id = $${params.length}`); }
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await scoped.query<{
      id: string; date: string; period_no: number;
      class_id: string; class_name: string; section_id: string; section_name: string;
      subject_id: string | null; subject_name: string | null;
      absent_staff_id: string; absent_staff_name: string;
      covering_staff_id: string | null; covering_staff_name: string | null;
      note: string | null;
    }>(
      `select ss.id, ss.date, ss.period_no,
              ss.class_id, c.name as class_name, ss.section_id, sec.name as section_name,
              ss.subject_id, sub.name as subject_name,
              ss.absent_staff_id, au.full_name as absent_staff_name,
              ss.covering_staff_id, cu.full_name as covering_staff_name,
              ss.note
         from staff_substitutions ss
         join classes c on c.id = ss.class_id
         join sections sec on sec.id = ss.section_id
         left join subjects sub on sub.id = ss.subject_id
         join staff astf on astf.id = ss.absent_staff_id
         join users au on au.id = astf.user_id
         left join staff cstf on cstf.id = ss.covering_staff_id
         left join users cu on cu.id = cstf.user_id
         ${where}
        order by ss.date desc, ss.period_no asc`,
      params
    );
    return rows.map((r) => ({
      id: r.id, date: r.date, periodNo: r.period_no,
      classId: r.class_id, className: r.class_name, sectionId: r.section_id, sectionName: r.section_name,
      subjectId: r.subject_id, subjectName: r.subject_name,
      absentStaffId: r.absent_staff_id, absentStaffName: r.absent_staff_name,
      coveringStaffId: r.covering_staff_id, coveringStaffName: r.covering_staff_name,
      note: r.note,
    }));
  });
}

const confirmRowSchema = z.object({
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  periodNo: z.number().int().min(1),
  subjectId: z.string().uuid().nullable().optional(),
  coveringStaffId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});
const confirmSchema = z.object({
  date: z.string().regex(DATE_RE, "Must be YYYY-MM-DD."),
  absentStaffId: z.string().uuid(),
  rows: z.array(confirmRowSchema).min(1),
});

/** "editable, regeneratable... a substitution record kept where confirmed
 *  sub will be kept" — persists the (possibly hand-edited) rows an admin
 *  approved after generateSubstitutionSuggestions(). ON CONFLICT on
 *  (date, class, section, period_no) means re-confirming the same date
 *  after editing/regenerating overwrites cleanly — never a duplicate row
 *  for one slot. */
export async function confirmSubstitutions(
  institutionId: string, authUserId: string, userId: string,
  input: z.infer<typeof confirmSchema>
): Promise<void> {
  const data = confirmSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    for (const row of data.rows) {
      if (row.coveringStaffId === data.absentStaffId) {
        throw new Error("The covering staff member cannot be the same as the absent staff member.");
      }
      const { rows: upserted } = await scoped.query<{ id: string }>(
        `insert into staff_substitutions (institution_id, date, period_no, class_id, section_id, subject_id, absent_staff_id, covering_staff_id, note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (institution_id, date, class_id, section_id, period_no)
         do update set subject_id = excluded.subject_id, absent_staff_id = excluded.absent_staff_id,
                        covering_staff_id = excluded.covering_staff_id, note = excluded.note, updated_at = now()
         returning id`,
        [institutionId, data.date, row.periodNo, row.classId, row.sectionId, row.subjectId ?? null, data.absentStaffId, row.coveringStaffId ?? null, row.note ?? null, userId]
      );
      await recordAudit(scoped, {
        institutionId, userId, action: "upsert", module: "substitution",
        entityType: "staff_substitutions", entityId: upserted[0].id, after: { ...row, date: data.date, absentStaffId: data.absentStaffId },
      });
    }
  });
}

export async function deleteSubstitution(institutionId: string, authUserId: string, userId: string, substitutionId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ id: string }>("select id from staff_substitutions where id = $1", [substitutionId]);
    if (!before[0]) return;
    await scoped.query("delete from staff_substitutions where id = $1", [substitutionId]);
    await recordAudit(scoped, {
      institutionId, userId, action: "delete", module: "substitution", entityType: "staff_substitutions", entityId: substitutionId,
    });
  });
}

// ---------------------------------------------------------------------------
// Reporting — "weekly, monthly reportable, like how many subs teachers got"
// ---------------------------------------------------------------------------
export interface SubstitutionReportRow {
  staffId: string; staffName: string;
  subsGiven: number;   // times this teacher covered for someone else
  subsNeeded: number;  // times this teacher was absent and needed a substitute
}

export async function getSubstitutionReport(
  institutionId: string, authUserId: string, from: string, to: string
): Promise<SubstitutionReportRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ staff_id: string; full_name: string; subs_given: string; subs_needed: string }>(
      `select s.id as staff_id, u.full_name,
              count(*) filter (where ss.covering_staff_id = s.id) as subs_given,
              count(*) filter (where ss.absent_staff_id = s.id) as subs_needed
         from staff s
         join users u on u.id = s.user_id
         left join staff_substitutions ss
                on (ss.covering_staff_id = s.id or ss.absent_staff_id = s.id) and ss.date between $1 and $2
        where s.employment_status = 'active'
        group by s.id, u.full_name
       having count(*) filter (where ss.covering_staff_id = s.id) > 0
           or count(*) filter (where ss.absent_staff_id = s.id) > 0
        order by subs_given desc, u.full_name`,
      [from, to]
    );
    return rows.map((r) => ({
      staffId: r.staff_id, staffName: r.full_name,
      subsGiven: Number(r.subs_given), subsNeeded: Number(r.subs_needed),
    }));
  });
}
