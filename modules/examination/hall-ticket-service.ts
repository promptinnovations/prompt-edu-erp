/**
 * PROMPT EDU ERP — Hall tickets (migration 0076).
 *
 * The admin feeds each grade's examination timetable (date, time, subject);
 * buildHallTickets() then produces one ticket per student of the chosen
 * grade / division, with or without the student's seat (room, bench, seat)
 * from Examinations > Seating Arrangement.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_HALL_TICKET_INSTRUCTIONS = [
  "Candidates should bring hall tickets on all days of examination.",
  "Candidates late by thirty minutes or more will not be allowed to attend the examination.",
  "Candidates should bring a ballpoint pen (blue or black), pencil, scale, eraser, and sharpener. Sharing of materials will not be allowed.",
  "Candidates will not be allowed to leave the examination hall before the prescribed time of examination.",
];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export interface HallTicketSettings {
  ticketTitle: string;
  address: string;
  email: string;
  phones: string;
  instructions: string[];
  showSignature: boolean;
  includeSeating: boolean;
}

const settingsSchema = z.object({
  ticketTitle: z.string().trim().min(1, "Give the ticket a title.").max(80),
  address: z.string().trim().max(200).default(""),
  email: z.string().trim().max(120).default(""),
  phones: z.string().trim().max(160).default(""),
  instructions: z.string().max(4000).default(""),
  showSignature: z.boolean(),
  includeSeating: z.boolean(),
});

export function defaultHallTicketSettings(): HallTicketSettings {
  return {
    ticketTitle: "ADMISSION TICKET", address: "", email: "", phones: "",
    instructions: DEFAULT_HALL_TICKET_INSTRUCTIONS, showSignature: true, includeSeating: false,
  };
}

export async function getHallTicketSettings(institutionId: string, authUserId: string): Promise<HallTicketSettings> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{
      ticket_title: string; address: string | null; email: string | null; phones: string | null;
      instructions: string | null; show_signature: boolean; include_seating: boolean;
    }>("select ticket_title, address, email, phones, instructions, show_signature, include_seating from hall_ticket_settings limit 1");
    const r = rows[0];
    if (!r) return defaultHallTicketSettings();
    const lines = (r.instructions ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    return {
      ticketTitle: r.ticket_title, address: r.address ?? "", email: r.email ?? "", phones: r.phones ?? "",
      instructions: lines.length > 0 ? lines : DEFAULT_HALL_TICKET_INSTRUCTIONS,
      showSignature: r.show_signature, includeSeating: r.include_seating,
    };
  });
}

export async function saveHallTicketSettings(
  institutionId: string, authUserId: string, userId: string, input: z.input<typeof settingsSchema>
): Promise<void> {
  const d = settingsSchema.parse(input);
  const instructions = d.instructions.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      `insert into hall_ticket_settings (institution_id, ticket_title, address, email, phones, instructions, show_signature, include_seating, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (institution_id) do update set ticket_title = excluded.ticket_title, address = excluded.address,
         email = excluded.email, phones = excluded.phones, instructions = excluded.instructions,
         show_signature = excluded.show_signature, include_seating = excluded.include_seating,
         updated_by = excluded.updated_by, updated_at = now()`,
      [institutionId, d.ticketTitle, d.address || null, d.email || null, d.phones || null, instructions || null, d.showSignature, d.includeSeating, userId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "upsert", module: "examination", entityType: "hall_ticket_settings", entityId: institutionId, after: d });
  });
}

/** The grades an examination covers (Examination detail page > classes). */
export async function listExamClasses(institutionId: string, authUserId: string, examinationId: string): Promise<{ id: string; name: string }[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string; name: string }>(
      `select distinct c.id, c.name, c.sort_order from exam_classes ec join classes c on c.id = ec.class_id
        where ec.examination_id = $1 order by c.sort_order`,
      [examinationId]
    );
    return rows.map((r) => ({ id: r.id, name: r.name }));
  });
}

// ---------------------------------------------------------------------------
// Timetable entry (per examination + grade)
// ---------------------------------------------------------------------------
export interface ExamTimetableRow {
  id: string; examinationId: string; classId: string; className: string;
  subjectId: string | null; subjectLabel: string;
  examDate: string; startTime: string; endTime: string | null;
}

export async function listExamTimetable(
  institutionId: string, authUserId: string, examinationId: string, classId?: string
): Promise<ExamTimetableRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{
      id: string; examination_id: string; class_id: string; class_name: string; subject_id: string | null; subject_label: string;
      exam_date: string; start_time: string; end_time: string | null;
    }>(
      `select t.id, t.examination_id, t.class_id, c.name as class_name, t.subject_id, t.subject_label,
              t.exam_date::text as exam_date, to_char(t.start_time, 'HH24:MI') as start_time,
              to_char(t.end_time, 'HH24:MI') as end_time
         from exam_timetable_entries t join classes c on c.id = t.class_id
        where t.examination_id = $1 and ($2::uuid is null or t.class_id = $2)
        order by c.sort_order, t.exam_date, t.start_time`,
      [examinationId, classId ?? null]
    );
    return rows.map((r) => ({
      id: r.id, examinationId: r.examination_id, classId: r.class_id, className: r.class_name, subjectId: r.subject_id,
      subjectLabel: r.subject_label, examDate: r.exam_date, startTime: r.start_time, endTime: r.end_time,
    }));
  });
}

const entrySchema = z.object({
  examinationId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid().nullable().optional(),
  subjectLabel: z.string().trim().max(120).optional(),
  examDate: z.string().regex(DATE_RE, "Date must be YYYY-MM-DD."),
  startTime: z.string().regex(TIME_RE, "Start time must be HH:MM."),
  endTime: z.string().regex(TIME_RE, "End time must be HH:MM.").nullable().optional(),
});

async function insertEntry(
  scoped: import("../../services/db/client").DbClient, institutionId: string, userId: string, input: z.input<typeof entrySchema>
): Promise<string> {
  const d = entrySchema.parse(input);
  if (d.endTime && d.endTime <= d.startTime) throw new Error("The end time must be after the start time.");
  let label = d.subjectLabel ?? "";
  if (d.subjectId) {
    const { rows } = await scoped.query<{ name: string }>("select name from subjects where id = $1", [d.subjectId]);
    if (!rows[0]) throw new Error("Subject not found.");
    if (!label) label = rows[0].name;
  }
  if (!label) throw new Error("Choose a subject or type its name.");
  const { rows } = await scoped.query<{ id: string }>(
    `insert into exam_timetable_entries (institution_id, examination_id, class_id, subject_id, subject_label, exam_date, start_time, end_time, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (institution_id, examination_id, class_id, exam_date, start_time)
     do update set subject_id = excluded.subject_id, subject_label = excluded.subject_label, end_time = excluded.end_time
     returning id`,
    [institutionId, d.examinationId, d.classId, d.subjectId ?? null, label, d.examDate, d.startTime, d.endTime ?? null, userId]
  );
  return rows[0].id;
}

export async function addExamTimetableEntry(
  institutionId: string, authUserId: string, userId: string, input: z.input<typeof entrySchema>
): Promise<string> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const id = await insertEntry(scoped, institutionId, userId, input);
    await recordAudit(scoped, { institutionId, userId, action: "upsert", module: "examination", entityType: "exam_timetable_entries", entityId: id, after: input });
    return id;
  });
}

export async function deleteExamTimetableEntry(institutionId: string, authUserId: string, userId: string, entryId: string): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query("delete from exam_timetable_entries where id = $1", [entryId]);
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "examination", entityType: "exam_timetable_entries", entityId: entryId });
  });
}

/** "Copy this grade's timetable to other grades" — replaces the target grades' timetables for the exam. */
export async function copyExamTimetable(
  institutionId: string, authUserId: string, userId: string,
  input: { examinationId: string; fromClassId: string; toClassIds: string[] }
): Promise<number> {
  const toClassIds = [...new Set(input.toClassIds)].filter((c) => c !== input.fromClassId);
  if (toClassIds.length === 0) throw new Error("Choose at least one other grade to copy to.");
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: source } = await scoped.query<{ subject_id: string | null; subject_label: string; exam_date: string; start_time: string; end_time: string | null }>(
      "select subject_id, subject_label, exam_date::text as exam_date, to_char(start_time,'HH24:MI') as start_time, to_char(end_time,'HH24:MI') as end_time from exam_timetable_entries where examination_id = $1 and class_id = $2",
      [input.examinationId, input.fromClassId]
    );
    if (source.length === 0) throw new Error("That grade has no timetable to copy.");
    for (const classId of toClassIds) {
      await scoped.query("delete from exam_timetable_entries where examination_id = $1 and class_id = $2", [input.examinationId, classId]);
      for (const s of source) {
        await insertEntry(scoped, institutionId, userId, {
          examinationId: input.examinationId, classId, subjectId: s.subject_id, subjectLabel: s.subject_label,
          examDate: s.exam_date, startTime: s.start_time, endTime: s.end_time,
        });
      }
    }
    await recordAudit(scoped, { institutionId, userId, action: "copy", module: "examination", entityType: "exam_timetable_entries", entityId: input.examinationId, after: { toClassIds } });
    return source.length * toClassIds.length;
  });
}

// ---------------------------------------------------------------------------
// Fast feeding: paste lines such as  "2026-12-01, 10:00-12:00, English"
// ---------------------------------------------------------------------------
export interface ParsedTimetableLine { examDate: string; startTime: string; endTime: string | null; subject: string }

function parseDate(s: string): string | null {
  const t = s.trim();
  if (DATE_RE.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}

function parseClock(s: string): string | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] ?? "0"); const ap = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; if (ap === "pm" && h !== 12) h += 12; if (ap === "am" && h === 12) h = 0; }
  else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parseTimetableText(text: string): { lines: ParsedTimetableLine[]; errors: string[] } {
  const lines: ParsedTimetableLine[] = []; const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/\t|\||,(?![^(]*\))/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length < 3) return void errors.push(`Line ${i + 1}: expected  date, time, subject.`);
    const date = parseDate(parts[0]);
    if (!date) return void errors.push(`Line ${i + 1}: "${parts[0]}" is not a date (use 2026-12-01 or 01/12/2026).`);
    const [startRaw, endRaw] = parts[1].split(/\s*(?:-|–|to)\s*/i);
    const start = parseClock(startRaw ?? ""); const end = endRaw ? parseClock(endRaw) : null;
    if (!start || (endRaw && !end)) return void errors.push(`Line ${i + 1}: "${parts[1]}" is not a time (use 10:00-12:00 or 10 AM - 12 PM).`);
    if (end && end <= start) return void errors.push(`Line ${i + 1}: the end time must be after the start time.`);
    lines.push({ examDate: date, startTime: start, endTime: end, subject: parts.slice(2).join(", ") });
  });
  return { lines, errors };
}

/** Adds every valid pasted line for one grade; returns what was added and what could not be read. */
export async function addExamTimetableFromText(
  institutionId: string, authUserId: string, userId: string,
  input: { examinationId: string; classId: string; text: string }
): Promise<{ added: number; errors: string[] }> {
  const { lines, errors } = parseTimetableText(input.text);
  if (lines.length === 0) return { added: 0, errors: errors.length ? errors : ["Nothing to add."] };
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: subjects } = await scoped.query<{ id: string; name: string }>("select id, name from subjects");
    const byName = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s]));
    for (const l of lines) {
      const match = byName.get(l.subject.trim().toLowerCase());
      await insertEntry(scoped, institutionId, userId, {
        examinationId: input.examinationId, classId: input.classId, subjectId: match?.id ?? null,
        subjectLabel: match?.name ?? l.subject, examDate: l.examDate, startTime: l.startTime, endTime: l.endTime,
      });
    }
    await recordAudit(scoped, { institutionId, userId, action: "bulk_add", module: "examination", entityType: "exam_timetable_entries", entityId: input.examinationId, after: { classId: input.classId, count: lines.length } });
    return { added: lines.length, errors };
  });
}

// ---------------------------------------------------------------------------
// The tickets
// ---------------------------------------------------------------------------
export interface HallTicketPaper { startTime: string; endTime: string | null; subject: string }
export interface HallTicketDay { date: string; papers: HallTicketPaper[] }
export interface HallTicket {
  studentId: string; name: string; admissionNumber: string | null; rollNumber: number | null;
  classId: string; className: string; sectionName: string | null;
  days: HallTicketDay[];
  seat: { room: string; bench: number; seat: number } | null;
}
export interface HallTicketBundle {
  examinationName: string; settings: HallTicketSettings; includeSeating: boolean;
  tickets: HallTicket[];
  /** Grades in the selection that have students but no timetable yet — no ticket is made for them. */
  classesWithoutTimetable: string[];
  /** includeSeating was on, but no seating plan exists for this examination (or some students have no seat). */
  seatingMissing: "no_plan" | "some_students" | null;
}

export async function buildHallTickets(
  institutionId: string, authUserId: string,
  opts: { examinationId: string; classId?: string; sectionId?: string; includeSeating?: boolean }
): Promise<HallTicketBundle | null> {
  const db = await getDbClient();
  const settings = await getHallTicketSettings(institutionId, authUserId);
  const includeSeating = opts.includeSeating ?? settings.includeSeating;
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: exam } = await scoped.query<{ name: string }>("select name from examinations where id = $1", [opts.examinationId]);
    if (!exam[0]) return null;

    const { rows: students } = await scoped.query<{
      student_id: string; full_name: string; admission_number: string | null; roll_number: number | null;
      class_id: string; class_name: string; section_name: string | null;
    }>(
      `select distinct s.id as student_id, s.full_name, s.admission_number, se.roll_number,
              c.id as class_id, c.name as class_name, c.sort_order, sec.name as section_name
         from exam_classes ec
         join classes c on c.id = ec.class_id
         join student_enrollments se on se.class_id = ec.class_id
              and (ec.section_id is null or se.section_id = ec.section_id) and se.status = 'active'
         join students s on s.id = se.student_id and s.status = 'active'
         left join sections sec on sec.id = se.section_id
        where ec.examination_id = $1
          and ($2::uuid is null or ec.class_id = $2)
          and ($3::uuid is null or se.section_id = $3)
        order by c.sort_order, sec.name nulls last, se.roll_number nulls last, s.full_name`,
      [opts.examinationId, opts.classId ?? null, opts.sectionId ?? null]
    );

    const { rows: entries } = await scoped.query<{ class_id: string; exam_date: string; start_time: string; end_time: string | null; subject_label: string }>(
      `select class_id, exam_date::text as exam_date, to_char(start_time,'HH24:MI') as start_time,
              to_char(end_time,'HH24:MI') as end_time, subject_label
         from exam_timetable_entries where examination_id = $1 order by exam_date, start_time`,
      [opts.examinationId]
    );
    const daysByClass = new Map<string, HallTicketDay[]>();
    for (const e of entries) {
      const days = daysByClass.get(e.class_id) ?? [];
      let day = days[days.length - 1];
      if (!day || day.date !== e.exam_date) { day = { date: e.exam_date, papers: [] }; days.push(day); }
      day.papers.push({ startTime: e.start_time, endTime: e.end_time, subject: e.subject_label });
      daysByClass.set(e.class_id, days);
    }

    const seatByStudent = new Map<string, { room: string; bench: number; seat: number }>();
    let hasPlan = false;
    if (includeSeating) {
      const { rows: plan } = await scoped.query<{ id: string }>("select id from exam_seating_plans where examination_id = $1", [opts.examinationId]);
      hasPlan = plan.length > 0;
      if (hasPlan) {
        const { rows: seats } = await scoped.query<{ student_id: string; room: string; bench_number: number; seat_number: number }>(
          `select a.student_id, r.name as room, a.bench_number, a.seat_number
             from exam_seating_assignments a join exam_seating_plan_rooms r on r.id = a.plan_room_id
            where a.plan_id = $1 and a.student_id is not null`,
          [plan[0].id]
        );
        for (const s of seats) seatByStudent.set(s.student_id, { room: s.room, bench: s.bench_number, seat: s.seat_number });
      }
    }

    const without = new Set<string>();
    const tickets: HallTicket[] = [];
    for (const s of students) {
      const days = daysByClass.get(s.class_id);
      if (!days || days.length === 0) { without.add(s.class_name); continue; }
      tickets.push({
        studentId: s.student_id, name: s.full_name, admissionNumber: s.admission_number, rollNumber: s.roll_number,
        classId: s.class_id, className: s.class_name, sectionName: s.section_name, days,
        seat: includeSeating ? seatByStudent.get(s.student_id) ?? null : null,
      });
    }
    return {
      examinationName: exam[0].name, settings, includeSeating, tickets,
      classesWithoutTimetable: [...without],
      seatingMissing: !includeSeating ? null : !hasPlan ? "no_plan" : tickets.some((t) => !t.seat) ? "some_students" : null,
    };
  });
}

/** "10:00" -> "10:00 AM". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
