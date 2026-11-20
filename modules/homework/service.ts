/**
 * PROMPT EDU ERP — Homework + syllabus progress (migration 0072;
 * "fill gaps in Portal").
 *
 * Teachers set homework for a class (one division or all) and subject;
 * students tick it done in their portal (or the teacher ticks it for them);
 * parents see it with the done ticks. Syllabus progress is read from the
 * portion plans teachers already keep (staff → portion plans): every
 * chapter planned for the student's class with its latest completion %.
 *
 * Who may set homework: management / admins (broad) for any class; a
 * teacher only for the class / division / subject of their own
 * teacher_assignments this year (a class teacher — an assignment with no
 * subject — for any subject of their class).
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export class HomeworkError extends Error {}

type Ctx = { institutionId: string; authUserId: string };
async function scopedRun<T>(c: Ctx, fn: (s: DbClient) => Promise<T>): Promise<T> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: c.institutionId, authUserId: c.authUserId }, fn);
}
const YEAR = "(select id from academic_years where is_current = true limit 1)";

export interface HomeworkTarget {
  class_id: string; class_name: string; section_id: string | null; section_name: string | null;
  subject_id: string | null; subject_name: string | null;
}

/** The class / division / subject combinations this user may set homework for. */
export async function listHomeworkTargets(institutionId: string, authUserId: string, userId: string, broad: boolean): Promise<HomeworkTarget[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = broad
      ? await s.query<HomeworkTarget>(
        `select c.id as class_id, c.name as class_name, null::uuid as section_id, null::text as section_name,
                sub.id as subject_id, sub.name as subject_name
           from class_subjects cs join classes c on c.id = cs.class_id join subjects sub on sub.id = cs.subject_id
          order by c.sort_order, c.name, sub.name`)
      : await s.query<HomeworkTarget>(
        `select distinct c.id as class_id, c.name as class_name, sec.id as section_id, sec.name as section_name,
                sub.id as subject_id, sub.name as subject_name, c.sort_order
           from teacher_assignments ta
           join classes c on c.id = ta.class_id
           left join sections sec on sec.id = ta.section_id
           left join class_subjects cs on ta.subject_id is null and cs.class_id = ta.class_id
           join subjects sub on sub.id = coalesce(ta.subject_id, cs.subject_id)
          where ta.user_id = $1 and ta.academic_year_id = ${YEAR}
          order by c.sort_order, c.name, sec.name nulls first, sub.name`,
        [userId]);
    return rows.map(({ class_id, class_name, section_id, section_name, subject_id, subject_name }) => ({ class_id, class_name, section_id, section_name, subject_id, subject_name }));
  });
}

const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
export const homeworkSchema = z.object({
  classId: z.string().uuid("Pick a class."),
  sectionId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Write what the homework is.").max(200),
  details: z.string().trim().max(4000).nullable().optional(),
  dueDate: optDate,
});

export async function createHomework(
  institutionId: string, authUserId: string, userId: string, input: z.input<typeof homeworkSchema>, opts: { broad: boolean }
): Promise<{ id: string }> {
  const v = homeworkSchema.parse(input);
  return scopedRun({ institutionId, authUserId }, async (s) => {
    if (!opts.broad) {
      const { rows } = await s.query<{ ok: boolean }>(
        `select exists(
           select 1 from teacher_assignments ta
            where ta.user_id = $1 and ta.academic_year_id = ${YEAR} and ta.class_id = $2
              and (ta.section_id is null or ta.section_id = $3::uuid)
              and ($3::uuid is not null or ta.section_id is null)
              and (ta.subject_id is null or ta.subject_id = $4::uuid)) as ok`,
        [userId, v.classId, v.sectionId ?? null, v.subjectId ?? null]
      );
      if (!rows[0]?.ok) throw new HomeworkError("You can set homework only for the classes and subjects you teach.");
    }
    const { rows: y } = await s.query<{ id: string }>(`select ${YEAR} as id`);
    if (!y[0]?.id) throw new HomeworkError("Set a current academic year first.");
    const { rows } = await s.query<{ id: string }>(
      `insert into homework (institution_id, academic_year_id, class_id, section_id, subject_id, title, details, due_date, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [institutionId, y[0].id, v.classId, v.sectionId ?? null, v.subjectId ?? null, v.title, v.details ?? null, v.dueDate, userId]
    ).catch((e: Error) => { if (/check/i.test(e.message)) throw new HomeworkError("The due date can't be before today."); throw e; });
    await recordAudit(s, { institutionId, userId, action: "create", module: "homework", entityType: "homework", entityId: rows[0].id, after: v });
    return rows[0];
  });
}

export async function deleteHomework(institutionId: string, authUserId: string, userId: string, homeworkId: string, opts: { broad: boolean }) {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ id: string }>(
      "delete from homework where id = $1 and ($2::boolean or created_by = $3) returning id",
      [homeworkId, opts.broad, userId]
    );
    if (!rows[0]) throw new HomeworkError("You can remove only homework you set.");
    await recordAudit(s, { institutionId, userId, action: "delete", module: "homework", entityType: "homework", entityId: homeworkId });
  });
}

export interface HomeworkRow {
  id: string; class_id: string; class_name: string; section_id: string | null; section_name: string | null;
  subject_name: string | null; title: string; details: string | null; assigned_on: string; due_date: string;
  set_by: string | null; created_by: string | null; done_count: number; student_count: number;
}

const HW_SELECT = `
  select h.id, h.class_id, c.name as class_name, h.section_id, sec.name as section_name, sub.name as subject_name,
         h.title, h.details, h.assigned_on::text as assigned_on, h.due_date::text as due_date, u.full_name as set_by, h.created_by,
         (select count(*) from homework_done d where d.homework_id = h.id)::int as done_count,
         (select count(*) from student_enrollments se
            where se.class_id = h.class_id and se.academic_year_id = h.academic_year_id and se.status = 'active'
              and (h.section_id is null or se.section_id = h.section_id))::int as student_count
    from homework h
    join classes c on c.id = h.class_id
    left join sections sec on sec.id = h.section_id
    left join subjects sub on sub.id = h.subject_id
    left join users u on u.id = h.created_by`;

const mapHw = (r: HomeworkRow): HomeworkRow => ({ ...r, done_count: Number(r.done_count), student_count: Number(r.student_count) });

/** Staff list: what this teacher set (everything, for management), newest due first. */
export async function listHomeworkForStaff(institutionId: string, authUserId: string, userId: string, opts: { broad: boolean; limit?: number }): Promise<HomeworkRow[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<HomeworkRow>(
      `${HW_SELECT}
        where h.academic_year_id = ${YEAR} and ($1::boolean or h.created_by = $2)
        order by h.due_date desc, h.created_at desc
        limit $3`,
      [opts.broad, userId, opts.limit ?? 60]
    );
    return rows.map(mapHw);
  });
}

export interface HomeworkDetail { homework: HomeworkRow; students: Array<{ student_id: string; full_name: string; section_name: string | null; roll_number: number | null; done: boolean }> }

export async function getHomeworkDetail(institutionId: string, authUserId: string, homeworkId: string): Promise<HomeworkDetail | null> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<HomeworkRow>(`${HW_SELECT} where h.id = $1`, [homeworkId]);
    if (!rows[0]) return null;
    const { rows: students } = await s.query<HomeworkDetail["students"][number]>(
      `select st.id as student_id, st.full_name, sec.name as section_name, se.roll_number,
              exists(select 1 from homework_done d where d.homework_id = h.id and d.student_id = st.id) as done
         from homework h
         join student_enrollments se on se.class_id = h.class_id and se.academic_year_id = h.academic_year_id and se.status = 'active'
              and (h.section_id is null or se.section_id = h.section_id)
         join students st on st.id = se.student_id
         left join sections sec on sec.id = se.section_id
        where h.id = $1
        order by sec.name, se.roll_number nulls last, st.full_name`,
      [homeworkId]
    );
    return { homework: mapHw(rows[0]), students };
  });
}

/** Ticks / unticks "done" for students of the homework's class. */
export async function setHomeworkDone(
  institutionId: string, authUserId: string, userId: string, homeworkId: string, studentIds: string[], done: boolean
): Promise<number> {
  if (studentIds.length === 0) return 0;
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows: ok } = await s.query<{ id: string }>(
      `select se.student_id as id from homework h
         join student_enrollments se on se.class_id = h.class_id and se.academic_year_id = h.academic_year_id and se.status = 'active'
              and (h.section_id is null or se.section_id = h.section_id)
        where h.id = $1 and se.student_id = any($2::uuid[])`,
      [homeworkId, studentIds]
    );
    const ids = ok.map((r) => r.id);
    if (ids.length === 0) throw new HomeworkError("This homework isn't for that student.");
    if (done) {
      await s.query(
        `insert into homework_done (institution_id, homework_id, student_id, marked_by)
         select $1, $2, sid, $3 from unnest($4::uuid[]) as sid on conflict (homework_id, student_id) do nothing`,
        [institutionId, homeworkId, userId, ids]
      );
    } else {
      await s.query("delete from homework_done where homework_id = $1 and student_id = any($2::uuid[])", [homeworkId, ids]);
    }
    return ids.length;
  });
}

/** Sets the whole class's ticks at once (the teacher's tick list). */
export async function saveHomeworkTicks(
  institutionId: string, authUserId: string, userId: string, homeworkId: string, doneIds: string[]
): Promise<void> {
  const detail = await getHomeworkDetail(institutionId, authUserId, homeworkId);
  if (!detail) throw new HomeworkError("Homework not found.");
  const want = new Set(doneIds);
  const add = detail.students.filter((x) => want.has(x.student_id) && !x.done).map((x) => x.student_id);
  const remove = detail.students.filter((x) => !want.has(x.student_id) && x.done).map((x) => x.student_id);
  if (add.length) await setHomeworkDone(institutionId, authUserId, userId, homeworkId, add, true);
  if (remove.length) await setHomeworkDone(institutionId, authUserId, userId, homeworkId, remove, false);
}

export interface StudentHomework {
  id: string; subject_name: string | null; title: string; details: string | null; assigned_on: string; due_date: string;
  set_by: string | null; done: boolean; overdue: boolean;
}

/** The student's homework this year (their class, their division or all divisions). */
export async function listStudentHomework(institutionId: string, authUserId: string, studentId: string, limit = 80): Promise<StudentHomework[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<StudentHomework>(
      `select h.id, sub.name as subject_name, h.title, h.details, h.assigned_on::text as assigned_on, h.due_date::text as due_date,
              u.full_name as set_by,
              exists(select 1 from homework_done d where d.homework_id = h.id and d.student_id = $1) as done,
              (h.due_date < current_date) as overdue
         from student_enrollments se
         join homework h on h.class_id = se.class_id and h.academic_year_id = se.academic_year_id
              and (h.section_id is null or h.section_id = se.section_id)
         left join subjects sub on sub.id = h.subject_id
         left join users u on u.id = h.created_by
        where se.student_id = $1 and se.status = 'active' and se.academic_year_id = ${YEAR}
        order by (h.due_date >= current_date) desc, case when h.due_date >= current_date then h.due_date end asc, h.due_date desc
        limit $2`,
      [studentId, limit]
    );
    return rows;
  });
}

export interface SyllabusSubject {
  subject_name: string; chapters: Array<{ chapter_name: string; planned_date: string | null; percent: number | null }>;
  average: number; done: number;
}

/** Syllabus progress for the student's class, from the teachers' portion plans. */
export async function getSyllabusProgress(institutionId: string, authUserId: string, studentId: string): Promise<SyllabusSubject[]> {
  return scopedRun({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ subject_name: string; chapter_name: string; planned_date: string | null; percent: number | null }>(
      `select sub.name as subject_name, pp.chapter_name, pp.planned_date::text as planned_date, pc.completion_percent as percent
         from student_enrollments se
         join portion_plans pp on pp.class_id = se.class_id and pp.academic_year_id = se.academic_year_id
         join subjects sub on sub.id = pp.subject_id
         left join lateral (
           select completion_percent from portion_completion
            where portion_plan_id = pp.id order by completed_date desc, created_at desc limit 1
         ) pc on true
        where se.student_id = $1 and se.status = 'active' and se.academic_year_id = ${YEAR}
        order by sub.name, pp.planned_date nulls last, pp.created_at`,
      [studentId]
    );
    const by = new Map<string, SyllabusSubject>();
    for (const r of rows) {
      const g = by.get(r.subject_name) ?? { subject_name: r.subject_name, chapters: [], average: 0, done: 0 };
      const pct = r.percent === null || r.percent === undefined ? null : Number(r.percent);
      g.chapters.push({ chapter_name: r.chapter_name, planned_date: r.planned_date, percent: pct });
      by.set(r.subject_name, g);
    }
    return [...by.values()].map((g) => ({
      ...g,
      average: Math.round(g.chapters.reduce((a, c) => a + (c.percent ?? 0), 0) / Math.max(1, g.chapters.length)),
      done: g.chapters.filter((c) => (c.percent ?? 0) >= 100).length,
    }));
  });
}
