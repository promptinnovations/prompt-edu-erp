/**
 * §Portfolio-years ("Portfolio: academic-year switcher") — which academic
 * years a student has a record in, and which of their records belong to
 * one year, so the staff Portfolio tab and the Learner Record can show any
 * single year (or every year) of the longitudinal portfolio.
 *
 * A record belongs to the year whose date range holds its date: an
 * achievement or character assessment by when it was recorded, a
 * co-curricular submission by when it was submitted, a discipline /
 * mentoring record or learner-record entry by its own date, a reading
 * record by when the book came back, and an exam by its academic year.
 */
import { getDbClient } from "../../services/db/client";

export interface StudentYear { id: string; name: string; start_date: string; end_date: string; is_current: boolean; class_label: string | null }

/** The years the student was enrolled in, plus the current year; newest first. */
export async function listStudentYears(institutionId: string, authUserId: string, studentId: string): Promise<StudentYear[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<StudentYear>(
      `select y.id, y.name, y.start_date::text as start_date, y.end_date::text as end_date, y.is_current,
              (select c.name || coalesce(' ' || sec.name, '')
                 from student_enrollments se join classes c on c.id = se.class_id left join sections sec on sec.id = se.section_id
                where se.student_id = $1 and se.academic_year_id = y.id
                order by (se.status = 'active') desc, se.enrollment_date desc limit 1) as class_label
         from academic_years y
        where y.is_current or exists (select 1 from student_enrollments se where se.student_id = $1 and se.academic_year_id = y.id)
        order by y.start_date desc`,
      [studentId]
    );
    return rows;
  });
}

export interface YearRecordIds {
  year: StudentYear;
  achievements: Set<string>; skills: Set<string>; character: Set<string>; discipline: Set<string>;
  exams: Set<string>; mentoring: Set<string>; reading: Set<string>; entries: Set<string>;
}

/** Ids of the student's records that fall in one academic year. */
export async function getYearRecordIds(
  institutionId: string, authUserId: string, studentId: string, yearId: string
): Promise<YearRecordIds | null> {
  const years = await listStudentYears(institutionId, authUserId, studentId);
  const year = years.find((y) => y.id === yearId);
  if (!year) return null;
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (s) => {
    const { rows } = await s.query<{ kind: string; id: string }>(
      `select 'achievements' as kind, id from achievements where student_id = $1 and created_at::date between $2::date and $3::date
       union all select 'skills', id from skill_submissions where student_id = $1 and coalesce(submitted_at, created_at)::date between $2::date and $3::date
       union all select 'character', id from character_assessments where student_id = $1 and created_at::date between $2::date and $3::date
       union all select 'discipline', id from discipline_records where student_id = $1 and date between $2::date and $3::date
       union all select 'exams', id from examinations where academic_year_id = $4
       union all select 'mentoring', id from mentoring_records where student_id = $1 and date between $2::date and $3::date
       union all select 'reading', id from reading_records where student_id = $1 and created_at::date between $2::date and $3::date
       union all select 'entries', id from learner_record_entries where student_id = $1 and entry_date between $2::date and $3::date`,
      [studentId, year.start_date, year.end_date, year.id]
    );
    const out: YearRecordIds = {
      year, achievements: new Set(), skills: new Set(), character: new Set(), discipline: new Set(),
      exams: new Set(), mentoring: new Set(), reading: new Set(), entries: new Set(),
    };
    for (const r of rows) (out[r.kind as keyof Omit<YearRecordIds, "year">] as Set<string>).add(r.id);
    return out;
  });
}

/** Keeps only the rows whose id is in the set (pure). */
export function inYear<T extends { id: string }>(rows: T[], ids: Set<string> | undefined): T[] {
  return ids ? rows.filter((r) => ids.has(r.id)) : rows;
}
