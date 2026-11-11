/**
 * PROMPT EDU ERP — Complete student details (class teachers).
 *
 * §Student-details ("incomplete details — class teachers must be able to
 * fill them"): bulk imports often arrive with gaps (no date of birth, no
 * mobile number, "To be updated" placeholders). This module lets the class
 * teacher of a division fill those gaps for their own students:
 * date of birth, gender, address, the father's name and mobile number, and
 * the mother's name and mobile number.
 *
 * Write access is decided HERE, not just by the page that shows the form:
 *   - `unrestricted` callers (super admin or student.edit) may edit any
 *     student;
 *   - everyone else may edit only students whose active, current-year
 *     enrolment falls in a class + division they hold a current-year
 *     `class_teacher` assignment for (the same coverage rule as report card
 *     remarks — a whole-class assignment covers every division).
 *
 * A blank field never erases what is already saved: teachers fill gaps,
 * they don't clear data. Parent records are shared between siblings, so a
 * corrected father's mobile number shows for every child linked to him.
 */
import { z } from "zod";
import { getDbClient, type DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { sortRoster } from "../../services/academic/roster-order";
import { coverageIncludes, getClassTeacherCoverage, type ClassTeacherCoverage } from "../report-card-remarks/service";

export { coverageIncludes, getClassTeacherCoverage, type ClassTeacherCoverage };

/** Text bulk imports put where a real value is still missing. */
export const PLACEHOLDER_VALUES = ["to be updated", "not given", "na", "n/a", "nil", "-", "0"];

export interface DetailsRosterRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  roll_number: number | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  class_id: string;
  class_name: string;
  stage: string | null;
  section_id: string;
  section_name: string;
  father_id: string | null;
  father_name: string | null;
  father_phone: string | null;
  mother_id: string | null;
  mother_name: string | null;
  mother_phone: string | null;
}

export type DetailField = "dateOfBirth" | "gender" | "fatherName" | "fatherPhone";

export const DETAIL_FIELD_LABELS: Record<DetailField, string> = {
  dateOfBirth: "Date of birth",
  gender: "Gender",
  fatherName: "Father's name",
  fatherPhone: "Mobile No",
};

function isBlank(v: string | null | undefined): boolean {
  const t = (v ?? "").trim().toLowerCase();
  return t === "" || PLACEHOLDER_VALUES.includes(t);
}

/** A usable mobile number: 10 digits starting 6–9 (India), or an
 *  international number of 11–15 digits written with a leading "+". */
export function isValidPhone(v: string | null | undefined): boolean {
  const raw = (v ?? "").trim();
  if (isBlank(raw)) return false;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && !raw.startsWith("+91")) return digits.length >= 11 && digits.length <= 15;
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local);
}

/** Normalises what a teacher types: "+91 98470 12345" / "98470-12345" ->
 *  "9847012345"; other international numbers keep their "+". Returns null
 *  for something that isn't a usable number. */
export function normalisePhone(v: string): string | null {
  const raw = v.trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && !raw.startsWith("+91")) {
    return digits.length >= 11 && digits.length <= 15 ? `+${digits}` : null;
  }
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

/** The core details still missing for one student (the fields a bulk
 *  import is expected to carry). Mother's details and address are
 *  optional and never make a student "incomplete". */
export function missingDetails(r: Pick<DetailsRosterRow, "date_of_birth" | "gender" | "father_name" | "father_phone">): DetailField[] {
  const out: DetailField[] = [];
  if (!r.date_of_birth) out.push("dateOfBirth");
  if (isBlank(r.gender)) out.push("gender");
  if (isBlank(r.father_name)) out.push("fatherName");
  if (!isValidPhone(r.father_phone)) out.push("fatherPhone");
  return out;
}

/** Students actively enrolled this academic year in one class (optionally
 *  one division), in roster order, with their father and mother. */
export async function listDetailsRoster(
  institutionId: string, authUserId: string, classId: string, sectionId?: string | null
): Promise<DetailsRosterRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<DetailsRosterRow>(
      `select s.id as student_id, s.full_name, s.admission_number, se.roll_number, s.gender,
              to_char(s.date_of_birth, 'YYYY-MM-DD') as date_of_birth, s.address,
              c.id as class_id, c.name as class_name, c.stage, sec.id as section_id, sec.name as section_name,
              f.id as father_id, f.full_name as father_name, f.phone as father_phone,
              m.id as mother_id, m.full_name as mother_name, m.phone as mother_phone
         from student_enrollments se
         join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
         join students s on s.id = se.student_id and s.status <> 'withdrawn'
         join classes c on c.id = se.class_id
         join sections sec on sec.id = se.section_id
         left join lateral (
           select p.id, p.full_name, p.phone from student_parents sp join parents p on p.id = sp.parent_id
            where sp.student_id = s.id and lower(trim(coalesce(sp.relationship, ''))) = 'father'
            order by sp.is_primary_contact desc, p.full_name limit 1
         ) f on true
         left join lateral (
           select p.id, p.full_name, p.phone from student_parents sp join parents p on p.id = sp.parent_id
            where sp.student_id = s.id and lower(trim(coalesce(sp.relationship, ''))) = 'mother'
            order by sp.is_primary_contact desc, p.full_name limit 1
         ) m on true
        where se.status = 'active' and se.class_id = $1 and ($2::uuid is null or se.section_id = $2::uuid)`,
      [classId, sectionId || null]
    );
    return sortRoster(rows);
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

const saveSchema = z.object({
  studentId: z.string().uuid(),
  dateOfBirth: optText(10),
  gender: z.enum(["male", "female", ""]).optional().transform((v) => (v ? v : undefined)),
  address: optText(500),
  fatherName: optText(200),
  fatherPhone: optText(30),
  motherName: optText(200),
  motherPhone: optText(30),
});

export type SaveStudentDetailsInput = z.input<typeof saveSchema>;

function checkDate(v: string): string {
  if (!DATE_RE.test(v)) throw new Error("Date of birth must be a valid date.");
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new Error("Date of birth must be a valid date.");
  const year = Number(v.slice(0, 4));
  const today = new Date().toISOString().slice(0, 10);
  if (v > today) throw new Error("Date of birth can't be in the future.");
  if (year < 1950) throw new Error("Date of birth looks wrong — please check the year.");
  return v;
}

function checkPhone(v: string, who: string): string {
  const n = normalisePhone(v);
  if (!n) throw new Error(`${who}'s mobile number should be 10 digits (e.g. 9847012345), or start with + for a number outside India.`);
  return n;
}

/** Fills one student's missing details. Only fields with a value are
 *  written; a blank field keeps what is already saved. Returns the names
 *  of the fields it changed. */
export async function saveStudentDetails(
  institutionId: string, authUserId: string, userId: string,
  input: SaveStudentDetailsInput,
  opts: { unrestricted: boolean }
): Promise<{ changed: string[] }> {
  const data = saveSchema.parse(input);
  const dob = data.dateOfBirth ? checkDate(data.dateOfBirth) : undefined;
  const fatherPhone = data.fatherPhone ? checkPhone(data.fatherPhone, "Father") : undefined;
  const motherPhone = data.motherPhone ? checkPhone(data.motherPhone, "Mother") : undefined;

  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: enrol } = await scoped.query<{ class_id: string; section_id: string }>(
      `select se.class_id, se.section_id from student_enrollments se
         join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
         join students s on s.id = se.student_id and s.status <> 'withdrawn'
        where se.student_id = $1 and se.status = 'active'
        limit 1`,
      [data.studentId]
    );
    if (!enrol[0]) throw new Error("This student isn't enrolled in a class this academic year.");
    if (!opts.unrestricted) {
      const { rows: covRows } = await scoped.query<{ class_id: string; section_id: string | null }>(
        `select ta.class_id, ta.section_id from teacher_assignments ta
           join academic_years ay on ay.id = ta.academic_year_id
          where ta.user_id = $1 and ta.role_type = 'class_teacher' and ay.is_current = true and ta.class_id is not null`,
        [userId]
      );
      const allowed = covRows.some((r) => r.class_id === enrol[0].class_id && (r.section_id == null || r.section_id === enrol[0].section_id));
      if (!allowed) throw new Error("Only the class teacher of this student's class can fill in their details.");
    }

    const changed: string[] = [];

    // Student's own fields.
    if (dob !== undefined || data.gender !== undefined || data.address !== undefined) {
      const { rows } = await scoped.query<{ id: string; date_of_birth: string | null; gender: string | null; address: string | null }>(
        `update students set
           date_of_birth = coalesce($1::date, date_of_birth),
           gender = coalesce($2, gender),
           address = coalesce($3, address),
           updated_at = now(), updated_by = $4
         where id = $5
         returning id, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, gender, address`,
        [dob ?? null, data.gender ?? null, data.address ?? null, userId, data.studentId]
      );
      if (rows.length === 0) throw new Error("Student not found.");
      if (dob !== undefined) changed.push("date of birth");
      if (data.gender !== undefined) changed.push("gender");
      if (data.address !== undefined) changed.push("address");
      await recordAudit(scoped, {
        institutionId, userId, action: "edit", module: "students", entityType: "students", entityId: data.studentId,
        after: { ...rows[0], source: "complete_details" },
      });
    }

    // Father / mother: update the linked record, or create and link one.
    for (const [relationship, name, phone, isPrimary] of [
      ["Father", data.fatherName, fatherPhone, true],
      ["Mother", data.motherName, motherPhone, false],
    ] as const) {
      if (name === undefined && phone === undefined) continue;
      const { rows: existing } = await scoped.query<{ id: string }>(
        `select p.id from student_parents sp join parents p on p.id = sp.parent_id
          where sp.student_id = $1 and lower(trim(coalesce(sp.relationship, ''))) = lower($2)
          order by sp.is_primary_contact desc, p.full_name limit 1`,
        [data.studentId, relationship]
      );
      if (existing[0]) {
        const { rows } = await scoped.query<{ id: string; full_name: string; phone: string | null }>(
          `update parents set full_name = coalesce($1, full_name), phone = coalesce($2, phone)
            where id = $3 returning id, full_name, phone`,
          [name ?? null, phone ?? null, existing[0].id]
        );
        await recordAudit(scoped, {
          institutionId, userId, action: "edit", module: "students", entityType: "parents", entityId: existing[0].id,
          after: { ...rows[0], source: "complete_details" },
        });
      } else {
        if (!name) throw new Error(`Enter the ${relationship.toLowerCase()}'s name along with the mobile number.`);
        const { rows: created } = await scoped.query<{ id: string }>(
          `insert into parents (institution_id, full_name, phone) values ($1, $2, $3) returning id`,
          [institutionId, name, phone ?? null]
        );
        const { rows: link } = await scoped.query<{ id: string }>(
          `insert into student_parents (institution_id, student_id, parent_id, relationship, is_primary_contact)
           values ($1, $2, $3, $4, $5) returning id`,
          [institutionId, data.studentId, created[0].id, relationship, isPrimary]
        );
        await recordAudit(scoped, {
          institutionId, userId, action: "create", module: "students", entityType: "parents", entityId: created[0].id,
          after: { full_name: name, phone: phone ?? null, relationship, student_parent_id: link[0].id, source: "complete_details" },
        });
      }
      if (name !== undefined) changed.push(`${relationship.toLowerCase()}'s name`);
      if (phone !== undefined) changed.push(`${relationship.toLowerCase()}'s mobile`);
    }

    return { changed };
  });
}

/** How many students in the given coverage still have missing core details
 *  (for a dashboard nudge). Admin callers pass coverage = null for the
 *  whole institution. */
export async function countIncompleteStudents(
  institutionId: string, authUserId: string, coverage: ClassTeacherCoverage | null
): Promise<{ incomplete: number; total: number }> {
  if (coverage && coverage.byClass.size === 0) return { incomplete: 0, total: 0 };
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ class_id: string; section_id: string; date_of_birth: string | null; gender: string | null; father_name: string | null; father_phone: string | null }>(
      `select se.class_id, se.section_id, to_char(s.date_of_birth, 'YYYY-MM-DD') as date_of_birth, s.gender,
              f.full_name as father_name, f.phone as father_phone
         from student_enrollments se
         join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
         join students s on s.id = se.student_id and s.status <> 'withdrawn'
         left join lateral (
           select p.full_name, p.phone from student_parents sp join parents p on p.id = sp.parent_id
            where sp.student_id = s.id and lower(trim(coalesce(sp.relationship, ''))) = 'father'
            order by sp.is_primary_contact desc, p.full_name limit 1
         ) f on true
        where se.status = 'active' and ($1::uuid[] is null or se.class_id = any($1::uuid[]))`,
      [coverage ? [...coverage.byClass.keys()] : null]
    );
    const inScope = coverage ? rows.filter((r) => coverageIncludes(coverage, r.class_id, r.section_id)) : rows;
    return { incomplete: inScope.filter((r) => missingDetails(r).length > 0).length, total: inScope.length };
  });
}

export type { DbClient };
