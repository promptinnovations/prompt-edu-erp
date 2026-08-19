/**
 * PROMPT EDU ERP — Home page composition (§ Home redesign follow-up:
 * "Number of classes, Divisions, students, teachers & staff etc.",
 * "Today's attendance Students/Staff", "Upcoming Calendar"). Pure
 * aggregation over existing module services/raw queries — nothing here
 * owns its own table, so it lives outside any one module's directory,
 * the same reasoning as services/onboarding/onboarding-service.ts.
 */
import { getDbClient } from "../db/client";
import { listUpcomingCalendarEvents } from "../../modules/calendar/service";

export interface InstitutionStats {
  classes: number;
  divisions: number; // "Divisions" is this institution's own word for sections (§ follow-up wording)
  students: number;
  teachers: number;
  staff: number;
}

export async function getInstitutionStats(institutionId: string, authUserId: string): Promise<InstitutionStats> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ classes: string; divisions: string; students: string; teachers: string; staff: string }>(
      `select
         (select count(*) from classes) as classes,
         (select count(*) from sections) as divisions,
         (select count(*) from students where status = 'active') as students,
         (select count(distinct ur.user_id) from user_roles ur join roles r on r.id = ur.role_id
           where ur.institution_id = $1 and r.code = 'teacher') as teachers,
         (select count(*) from staff where employment_status = 'active') as staff`,
      [institutionId]
    );
    const r = rows[0];
    return {
      classes: Number(r.classes), divisions: Number(r.divisions), students: Number(r.students),
      teachers: Number(r.teachers), staff: Number(r.staff),
    };
  });
}

export interface TodayAttendanceSummary {
  studentsEnrolled: number; studentsMarked: number; studentsPresent: number; studentsAbsent: number;
  staffTotal: number; staffMarked: number; staffPresent: number; staffAbsent: number;
}

/** "Today's attendance Students / Staff" — student side reuses the same
 *  aggregate query getDailyAttendanceOverview() already computes for the
 *  Attendance page's principal overview (just summed across every class
 *  here rather than shown per-class); staff side is the analogous
 *  institution-wide roll-up over staff_attendance, which had no existing
 *  "every staff member, one date" aggregate to reuse. */
export async function getTodayAttendanceSummary(institutionId: string, authUserId: string, date: string): Promise<TodayAttendanceSummary> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: studentRows } = await scoped.query<{ enrolled: string; marked: string; present: string; absent: string }>(
      `select count(distinct se.student_id) as enrolled,
              count(distinct ar.student_id) as marked,
              count(distinct ar.student_id) filter (where ast.counts_as_present) as present,
              count(distinct ar.student_id) filter (where not ast.counts_as_present) as absent
         from student_enrollments se
         join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
         left join attendance_records ar on ar.student_id = se.student_id and ar.date = $1
         left join attendance_statuses ast on ast.id = ar.status_id
        where se.status = 'active'`,
      [date]
    );
    const { rows: staffRows } = await scoped.query<{ total: string; marked: string; present: string; absent: string }>(
      `select count(*) as total,
              count(sa.id) as marked,
              count(*) filter (where ast.counts_as_present) as present,
              count(*) filter (where sa.id is not null and not ast.counts_as_present) as absent
         from staff st
         left join staff_attendance sa on sa.staff_id = st.id and sa.date = $1
         left join attendance_statuses ast on ast.id = sa.status_id
        where st.employment_status = 'active'`,
      [date]
    );
    const s = studentRows[0];
    const st = staffRows[0];
    return {
      studentsEnrolled: Number(s.enrolled), studentsMarked: Number(s.marked),
      studentsPresent: Number(s.present), studentsAbsent: Number(s.absent),
      staffTotal: Number(st.total), staffMarked: Number(st.marked),
      staffPresent: Number(st.present), staffAbsent: Number(st.absent),
    };
  });
}

export interface UpcomingItem { id: string; title: string; date: string; endDate: string | null; kind: "calendar" | "exam"; subKind: string }

/** "Upcoming Calendar" — merges calendar_events with upcoming examination
 *  dates (an exam is, functionally, also something "upcoming on the
 *  calendar" even before any calendar_events row exists for it) into one
 *  date-sorted list. Silently returns an empty calendar half if the
 *  `calendar` module is disabled for this institution — callers already
 *  gate the whole widget on module/permission the same way every other
 *  Home widget does. */
export async function getUpcomingItems(institutionId: string, authUserId: string, limit = 6): Promise<UpcomingItem[]> {
  const db = await getDbClient();
  const [events, exams] = await Promise.all([
    listUpcomingCalendarEvents(institutionId, authUserId, limit).catch(() => []),
    db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const { rows } = await scoped.query<{ id: string; name: string; start_date: string | null; end_date: string | null }>(
        `select id, name, start_date, end_date from examinations
          where start_date is not null and start_date >= current_date
          order by start_date asc limit $1`,
        [limit]
      );
      return rows;
    }),
  ]);
  const items: UpcomingItem[] = [
    ...events.map((e) => ({ id: `cal:${e.id}`, title: e.title, date: e.start_date, endDate: e.end_date, kind: "calendar" as const, subKind: e.event_type })),
    ...exams.map((e) => ({ id: `exam:${e.id}`, title: e.name, date: e.start_date as string, endDate: e.end_date, kind: "exam" as const, subKind: "exam" })),
  ];
  items.sort((a, b) => a.date.localeCompare(b.date));
  return items.slice(0, limit);
}
