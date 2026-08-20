/**
 * PROMPT EDU ERP — Attendance module service.
 * ARCHITECTURE.md §D.6 (Attendance & leave), Phase 4 (§AA.2).
 *
 * attendance_statuses is institution CONFIGURATION (§K "never hard-code
 * institutional values") — nothing in this file assumes particular status
 * codes/labels; every lookup goes through attendance_statuses for the
 * calling institution. §36's one non-negotiable rule (exactly one row is
 * is_default=true) is enforced by seed data + the UI defaulting to it, not
 * by application logic hard-coding a status.
 *
 * Every function requires an explicit institutionId and runs through
 * db.withInstitutionContext, so RLS (§E Gate 2) and this institutionId
 * (§E Gate 1) must independently agree.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { notifyUser } from "../../services/notification/notification-service";

export interface AttendanceStatusRecord {
  id: string; code: string; label: string; counts_as_present: boolean; is_default: boolean;
}
export interface AttendanceGridRow {
  student_id: string; student_name: string; admission_number: string;
  record_id: string | null; status_id: string | null; is_late: boolean; late_minutes: number | null;
}
export interface AttendanceSummary {
  student_id: string; total_days: number; present_days: number; absent_days: number;
  late_days: number; present_percent: number;
}
export interface LeaveApplicationRecord {
  id: string; applicant_type: string; applicant_id: string; start_date: string; end_date: string;
  reason: string | null; status: string; reviewed_by: string | null; reviewed_at: string | null;
}

// ---------------------------------------------------------------------------
// Attendance statuses (config)
// ---------------------------------------------------------------------------
export async function listAttendanceStatuses(institutionId: string, authUserId: string): Promise<AttendanceStatusRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AttendanceStatusRecord>(
      "select id, code, label, counts_as_present, is_default from attendance_statuses order by is_default desc, label"
    );
    return rows;
  });
}

const createStatusSchema = z.object({
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  countsAsPresent: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export async function createAttendanceStatus(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createStatusSchema>
): Promise<AttendanceStatusRecord> {
  const data = createStatusSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    if (data.isDefault) {
      await scoped.query("update attendance_statuses set is_default = false where is_default = true");
    }
    const { rows } = await scoped.query<AttendanceStatusRecord>(
      `insert into attendance_statuses (institution_id, code, label, counts_as_present, is_default)
       values ($1, $2, $3, $4, $5)
       returning id, code, label, counts_as_present, is_default`,
      [institutionId, data.code, data.label, data.countsAsPresent, data.isDefault]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "attendance", entityType: "attendance_statuses", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// Daily attendance grid (§D.6, mirrors the marks-grid pattern in §28)
// ---------------------------------------------------------------------------
export async function getAttendanceGrid(
  institutionId: string, authUserId: string, classId: string, sectionId: string, date: string
): Promise<AttendanceGridRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AttendanceGridRow>(
      `select s.id as student_id, s.full_name as student_name, s.admission_number,
              ar.id as record_id, ar.status_id, coalesce(ar.is_late, false) as is_late, ar.late_minutes
         from student_enrollments se
         join students s on s.id = se.student_id
         join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
         left join attendance_records ar on ar.student_id = s.id and ar.date = $3
        where se.class_id = $1 and se.section_id = $2 and se.status = 'active'
        order by s.full_name`,
      [classId, sectionId, date]
    );
    return rows;
  });
}

/** "Attendance > Monthly register" follow-up — one row per enrolled
 *  student, one column per calendar day of the given month, cell = the
 *  attendance status CODE recorded that day (or null if unmarked/no school
 *  day was taken). Deliberately returns a sparse `Map<studentId,
 *  Map<isoDate, statusCode>>` rather than a wide pre-pivoted row shape —
 *  the UI decides how many day-columns to render (28-31, weekends
 *  greyed out, etc.), this just supplies the underlying facts. */
export interface MonthlyRegisterRow { student_id: string; student_name: string; admission_number: string }
export interface MonthlyRegisterEntry { student_id: string; date: string; status_code: string }

export async function getMonthlyAttendanceRegister(
  institutionId: string, authUserId: string, classId: string, sectionId: string, year: number, month: number
): Promise<{ students: MonthlyRegisterRow[]; entries: MonthlyRegisterEntry[] }> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: students } = await scoped.query<MonthlyRegisterRow>(
      `select s.id as student_id, s.full_name as student_name, s.admission_number
         from student_enrollments se
         join students s on s.id = se.student_id
         join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
        where se.class_id = $1 and se.section_id = $2 and se.status = 'active'
        order by s.full_name`,
      [classId, sectionId]
    );
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const { rows: entries } = await scoped.query<MonthlyRegisterEntry>(
      `select ar.student_id, to_char(ar.date, 'YYYY-MM-DD') as date, ast.code as status_code
         from attendance_records ar
         join attendance_statuses ast on ast.id = ar.status_id
        where ar.class_id = $1 and ar.section_id = $2
          and ar.date >= $3::date and ar.date < ($3::date + interval '1 month')`,
      [classId, sectionId, monthStart]
    );
    return { students, entries };
  });
}

const markAttendanceEntrySchema = z.object({
  studentId: z.string().uuid(),
  statusId: z.string().uuid(),
  isLate: z.boolean().default(false),
  lateMinutes: z.number().int().nonnegative().nullable().optional(),
});
const markAttendanceSchema = z.object({
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  date: z.string().min(1),
  entries: z.array(markAttendanceEntrySchema),
});

/** Bulk upsert for one class/section/date — one call per "take attendance" submission. */
export async function markAttendance(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof markAttendanceSchema>
): Promise<{ marked: number }> {
  const data = markAttendanceSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    let marked = 0;
    for (const e of data.entries) {
      await scoped.query(
        `insert into attendance_records
           (institution_id, student_id, class_id, section_id, date, status_id, is_late, late_minutes, marked_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (institution_id, student_id, date)
         do update set status_id = excluded.status_id, is_late = excluded.is_late,
                        late_minutes = excluded.late_minutes, section_id = excluded.section_id,
                        class_id = excluded.class_id, marked_by = excluded.marked_by, updated_at = now()`,
        [institutionId, e.studentId, data.classId, data.sectionId, data.date, e.statusId, e.isLate, e.lateMinutes ?? null, userId]
      );
      marked++;
    }
    await recordAudit(scoped, {
      institutionId, userId, action: "mark", module: "attendance", entityType: "attendance_records",
      entityId: data.classId, after: { classId: data.classId, sectionId: data.sectionId, date: data.date, count: marked },
    });
    return { marked };
  });
}

// ---------------------------------------------------------------------------
// Attendance summary (§D.6 / feeds the analytics engine in §N once approved
// data exists — this is the raw per-student rollup other modules read from)
// ---------------------------------------------------------------------------
export async function getStudentAttendanceSummary(
  institutionId: string, authUserId: string, studentId: string, fromDate: string, toDate: string
): Promise<AttendanceSummary> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ total: string; present: string; absent: string; late: string }>(
      `select
          count(*) as total,
          count(*) filter (where st.counts_as_present) as present,
          count(*) filter (where not st.counts_as_present) as absent,
          count(*) filter (where ar.is_late) as late
        from attendance_records ar
        join attendance_statuses st on st.id = ar.status_id
       where ar.student_id = $1 and ar.date between $2 and $3`,
      [studentId, fromDate, toDate]
    );
    const total = Number(rows[0]?.total ?? 0);
    const present = Number(rows[0]?.present ?? 0);
    return {
      student_id: studentId,
      total_days: total,
      present_days: present,
      absent_days: Number(rows[0]?.absent ?? 0),
      late_days: Number(rows[0]?.late ?? 0),
      present_percent: total > 0 ? Math.round((present / total) * 10000) / 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Leave applications (§D.6)
// ---------------------------------------------------------------------------
const applyForLeaveSchema = z.object({
  applicantType: z.enum(["student", "staff"]),
  applicantId: z.string().uuid(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().max(1000).nullable().optional(),
});

export async function applyForLeave(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof applyForLeaveSchema>
): Promise<LeaveApplicationRecord> {
  const data = applyForLeaveSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<LeaveApplicationRecord>(
      `insert into leave_applications (institution_id, applicant_type, applicant_id, start_date, end_date, reason)
       values ($1, $2, $3, $4, $5, $6)
       returning id, applicant_type, applicant_id, start_date, end_date, reason, status, reviewed_by, reviewed_at`,
      [institutionId, data.applicantType, data.applicantId, data.startDate, data.endDate, data.reason ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "attendance", entityType: "leave_applications", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function listLeaveApplications(
  institutionId: string, authUserId: string, status?: string
): Promise<LeaveApplicationRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = status
      ? await scoped.query<LeaveApplicationRecord>(
          `select id, applicant_type, applicant_id, start_date, end_date, reason, status, reviewed_by, reviewed_at
             from leave_applications where status = $1 order by created_at desc`,
          [status]
        )
      : await scoped.query<LeaveApplicationRecord>(
          `select id, applicant_type, applicant_id, start_date, end_date, reason, status, reviewed_by, reviewed_at
             from leave_applications order by created_at desc`
        );
    return rows;
  });
}

/** A single applicant's own leave history, regardless of type — powers the
 *  new staff self-service "My leave" section on the Attendance page (§Page-4
 *  follow-up "each staff...should have a portion for applying leave from
 *  their own page"), mirroring listLeaveApplicationsForStudent()'s exact
 *  self-scoping shape below (never the institution-wide list, so applying
 *  for your own leave never needs a broad attendance.* permission). */
export async function listLeaveApplicationsForApplicant(
  institutionId: string, authUserId: string, applicantType: "student" | "staff", applicantId: string
): Promise<LeaveApplicationRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<LeaveApplicationRecord>(
      `select id, applicant_type, applicant_id, start_date, end_date, reason, status, reviewed_by, reviewed_at
         from leave_applications
        where applicant_type = $1 and applicant_id = $2
        order by created_at desc`,
      [applicantType, applicantId]
    );
    return rows;
  });
}

/** A student applicant's own leave history — used by the parent portal
 *  (§D.6 follow-up "parents log in need an option to apply for leave"),
 *  scoped to one already-verified-as-own-child studentId rather than the
 *  institution-wide listLeaveApplications() above, so a parent action never
 *  needs (and is never granted) the broad attendance.view/edit permission
 *  just to see their own child's leave requests. */
export async function listLeaveApplicationsForStudent(
  institutionId: string, authUserId: string, studentId: string
): Promise<LeaveApplicationRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<LeaveApplicationRecord>(
      `select id, applicant_type, applicant_id, start_date, end_date, reason, status, reviewed_by, reviewed_at
         from leave_applications
        where applicant_type = 'student' and applicant_id = $1
        order by created_at desc`,
      [studentId]
    );
    return rows;
  });
}

/** Leave applications whose [start_date, end_date] range covers `date`,
 *  restricted to student applicants currently enrolled in `classId` — the
 *  Attendance page's "leaves applied for THIS class, today" list (§D.6
 *  follow-up), rather than the institution-wide list every class used to
 *  share. */
export async function listLeaveApplicationsForClassOnDate(
  institutionId: string, authUserId: string, classId: string, date: string
): Promise<LeaveApplicationRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<LeaveApplicationRecord>(
      `select la.id, la.applicant_type, la.applicant_id, la.start_date, la.end_date, la.reason, la.status,
              la.reviewed_by, la.reviewed_at
         from leave_applications la
         join student_enrollments se on se.student_id = la.applicant_id and se.status = 'active'
         join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
        where la.applicant_type = 'student' and se.class_id = $1
          and $2 between la.start_date and la.end_date
        order by la.created_at desc`,
      [classId, date]
    );
    return rows;
  });
}

/** Is `callerUserId` the class teacher (teacher_assignments.role_type =
 *  'class_teacher') of the class/section a student applicant is CURRENTLY
 *  enrolled in? The application-layer scoping gate that lets the
 *  attendance.leave.review_own_class permission mean "only MY class", not
 *  "any class" — same shape as mentoring's "assigned mentor only" rule
 *  (migration 0013) and portal's isOwnChild() self-scoping. A class-teacher
 *  assignment with section_id = null covers the whole class (every
 *  section); one with a section_id only covers that section. */
export async function isClassTeacherOfStudent(
  institutionId: string, authUserId: string, callerUserId: string, studentId: string
): Promise<boolean> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ ok: boolean }>(
      `select exists (
         select 1
           from student_enrollments se
           join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
           join teacher_assignments ta on ta.class_id = se.class_id
                and ta.role_type = 'class_teacher'
                and (ta.section_id is null or ta.section_id = se.section_id)
          where se.student_id = $1 and se.status = 'active' and ta.user_id = $2
       ) as ok`,
      [studentId, callerUserId]
    );
    return rows[0]?.ok ?? false;
  });
}

/** Whether `callerUserId` may approve/reject THIS leave application —
 *  unrestricted for attendance.edit holders (institution_admin/management),
 *  scoped to "my own class only" for attendance.leave.review_own_class
 *  holders (class teachers). The caller (server action) checks this AFTER
 *  requirePermission("attendance.edit") OR requirePermission
 *  ("attendance.leave.review_own_class") already confirmed the caller has
 *  ONE of the two permissions — this function decides which rule applies. */
export async function canReviewLeaveApplication(
  institutionId: string, authUserId: string, callerUserId: string, hasUnrestrictedEdit: boolean, leaveId: string
): Promise<boolean> {
  if (hasUnrestrictedEdit) return true;
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ applicant_type: string; applicant_id: string }>(
      "select applicant_type, applicant_id from leave_applications where id = $1",
      [leaveId]
    );
    if (rows.length === 0 || rows[0].applicant_type !== "student") return false;
    return isClassTeacherOfStudent(institutionId, authUserId, callerUserId, rows[0].applicant_id);
  });
}

// ---------------------------------------------------------------------------
// Attendance alerts — absentee/late-coming WhatsApp notifications (§D.6
// follow-up: "attendance must present by default... if someone marked for
// late coming that also should go as a message... once attendance is
// saved, a preview of absentee and latecoming alert will be shown, should
// be editable, cancellable, then press confirm whatsapp message will be
// sent"). Two-step by design: markAttendance() above already persisted the
// records (attendance data must be saved regardless of whether any alert
// is ever confirmed/sent); these two functions are the separate,
// explicitly-confirmed second step.
// ---------------------------------------------------------------------------
export interface AttendanceAlertCandidate {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  statusLabel: string;
  countsAsPresent: boolean;
  isLate: boolean;
  lateMinutes: number | null;
  /** null when the student has no linked portal login (see
   *  modules/portal/service.ts's createStudentLoginAccount — the login's
   *  password IS the parent's phone number, so users.phone doubles as the
   *  parent contact number for messaging). No phone means this row can be
   *  previewed but not sent. */
  phone: string | null;
  defaultMessage: string;
}

/** Builds the preview list — every student marked absent or late for this
 *  class/section/date, with a ready-to-edit default WhatsApp message per
 *  row. Read-only; sends nothing (see sendAttendanceAlerts() below for the
 *  confirm step). */
export async function getAttendanceAlertCandidates(
  institutionId: string, authUserId: string, classId: string, sectionId: string, date: string
): Promise<AttendanceAlertCandidate[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: instRows } = await scoped.query<{ name: string }>("select name from institutions limit 1");
    const institutionName = instRows[0]?.name ?? "your institution";

    const { rows } = await scoped.query<{
      student_id: string; student_name: string; admission_number: string;
      status_label: string; counts_as_present: boolean; is_late: boolean; late_minutes: number | null;
      phone: string | null;
    }>(
      `select s.id as student_id, s.full_name as student_name, s.admission_number,
              ast.label as status_label, ast.counts_as_present, coalesce(ar.is_late, false) as is_late,
              ar.late_minutes, u.phone
         from attendance_records ar
         join students s on s.id = ar.student_id
         join attendance_statuses ast on ast.id = ar.status_id
         left join users u on u.id = s.user_id
        where ar.class_id = $1 and ar.section_id = $2 and ar.date = $3
          and (ast.counts_as_present = false or coalesce(ar.is_late, false) = true)
        order by s.full_name`,
      [classId, sectionId, date]
    );

    return rows.map((r): AttendanceAlertCandidate => {
      const defaultMessage = !r.counts_as_present
        ? `Dear Parent, ${r.student_name} was marked ABSENT today (${date}) at ${institutionName}. Please contact the class teacher if this is unexpected.`
        : `Dear Parent, ${r.student_name} arrived LATE${r.late_minutes ? ` (${r.late_minutes} min)` : ""} today (${date}) at ${institutionName}.`;
      return {
        studentId: r.student_id,
        studentName: r.student_name,
        admissionNumber: r.admission_number,
        statusLabel: r.status_label,
        countsAsPresent: r.counts_as_present,
        isLate: r.is_late,
        lateMinutes: r.late_minutes,
        phone: r.phone,
        defaultMessage,
      };
    });
  });
}

const sendAlertsSchema = z.object({
  alerts: z.array(z.object({
    studentId: z.string().uuid(),
    message: z.string().min(1).max(1000),
  })).min(1),
});

export interface SendAttendanceAlertsResult {
  studentId: string;
  ok: boolean;
  reason?: string;
}

/** The confirm step — sends exactly the (possibly hand-edited) alerts the
 *  caller submits, one WhatsApp notifyUser() call per student, via each
 *  student's own linked users row (§D.6 follow-up "confirm, whatsapp
 *  message will be sent"). Students with no portal login (no linked
 *  users.id) are skipped with an explicit reason rather than silently
 *  dropped, so the UI can show exactly which alerts didn't go out and why. */
export async function sendAttendanceAlerts(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof sendAlertsSchema>
): Promise<SendAttendanceAlertsResult[]> {
  const data = sendAlertsSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const results: SendAttendanceAlertsResult[] = [];
    for (const alert of data.alerts) {
      const { rows } = await scoped.query<{ user_id: string | null }>(
        "select user_id from students where id = $1", [alert.studentId]
      );
      const studentUserId = rows[0]?.user_id ?? null;
      if (!studentUserId) {
        results.push({ studentId: alert.studentId, ok: false, reason: "No portal login (and phone number) on file for this student." });
        continue;
      }
      await notifyUser(institutionId, authUserId, studentUserId, {
        type: "attendance_alert",
        title: "Attendance alert",
        body: alert.message,
        channels: ["whatsapp"],
        relatedEntityType: "students",
        relatedEntityId: alert.studentId,
      }, scoped);
      results.push({ studentId: alert.studentId, ok: true });
    }
    await recordAudit(scoped, {
      institutionId, userId, action: "send_alerts", module: "attendance", entityType: "attendance_records",
      entityId: null, after: { count: data.alerts.length, sent: results.filter((r) => r.ok).length },
    });
    return results;
  });
}

// ---------------------------------------------------------------------------
// Daily attendance overview (§D.6 follow-up: "daily attendance + absentee
// list must be visible to principal") — an institution-wide, per-date
// rollup across every class/section, for whoever holds the unrestricted
// attendance.edit permission (institution_admin, and the "management"/
// Principal role once granted it — see services/super-admin/
// super-admin-service.ts's DEFAULT_ROLE_PERMISSION_GRANTS).
// ---------------------------------------------------------------------------
export interface DailyClassAttendanceRow {
  classId: string; className: string; sectionId: string; sectionName: string;
  enrolled: number; marked: number; present: number; absent: number; late: number;
}
export interface DailyAttendanceOverview {
  classes: DailyClassAttendanceRow[];
  absentees: Array<{ studentId: string; studentName: string; className: string; sectionName: string }>;
}

/** §Attendance-follow-up-3 role-based scoping, shared by
 *  getDailyAttendanceOverview() and getInstitutionAttendanceTrend(): pass
 *  `classIds` for a teacher (their own assigned classes, from
 *  getTeacherClassScope()) or `stages` for a Section Head (their assigned
 *  section(s)/stage(s), from getStaffSectionScope()) — never both, and
 *  omit/pass null for the institution-wide, unrestricted view. Exactly one
 *  of the two is meaningful per caller; both undefined means "no
 *  restriction" (the pre-existing behavior, Principal/Management/Admin). */
export interface AttendanceScope {
  classIds?: string[] | null;
  stages?: string[] | null;
}

export async function getDailyAttendanceOverview(
  institutionId: string, authUserId: string, date: string, scope?: AttendanceScope
): Promise<DailyAttendanceOverview> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: classRows } = await scoped.query<DailyClassAttendanceRow & { enrolled: string; marked: string; present: string; absent: string; late: string }>(
      `select se.class_id as "classId", c.name as "className", se.section_id as "sectionId", sec.name as "sectionName",
              count(distinct se.student_id) as enrolled,
              count(distinct ar.student_id) as marked,
              count(distinct ar.student_id) filter (where ast.counts_as_present) as present,
              count(distinct ar.student_id) filter (where not ast.counts_as_present) as absent,
              count(distinct ar.student_id) filter (where ar.is_late) as late
         from student_enrollments se
         join academic_years ay on ay.id = se.academic_year_id and ay.is_current = true
         join classes c on c.id = se.class_id
         join sections sec on sec.id = se.section_id
         left join attendance_records ar on ar.student_id = se.student_id and ar.date = $1
         left join attendance_statuses ast on ast.id = ar.status_id
        where se.status = 'active'
          and ($2::uuid[] is null or se.class_id = any($2))
          and ($3::text[] is null or c.stage = any($3))
        group by se.class_id, c.name, se.section_id, sec.name, c.sort_order
        order by c.sort_order, sec.name`,
      [date, scope?.classIds ?? null, scope?.stages ?? null]
    );

    const { rows: absenteeRows } = await scoped.query<{ studentId: string; studentName: string; className: string; sectionName: string }>(
      `select s.id as "studentId", s.full_name as "studentName", c.name as "className", sec.name as "sectionName"
         from attendance_records ar
         join students s on s.id = ar.student_id
         join attendance_statuses ast on ast.id = ar.status_id
         join classes c on c.id = ar.class_id
         join sections sec on sec.id = ar.section_id
        where ar.date = $1 and ast.counts_as_present = false
          and ($2::uuid[] is null or ar.class_id = any($2))
          and ($3::text[] is null or c.stage = any($3))
        order by c.sort_order, sec.name, s.full_name`,
      [date, scope?.classIds ?? null, scope?.stages ?? null]
    );

    return {
      classes: classRows.map((r) => ({
        classId: r.classId, className: r.className, sectionId: r.sectionId, sectionName: r.sectionName,
        enrolled: Number(r.enrolled), marked: Number(r.marked), present: Number(r.present),
        absent: Number(r.absent), late: Number(r.late),
      })),
      absentees: absenteeRows,
    };
  });
}

/** Approve/reject a leave application (§D.6). Caller (server action) must
 *  check the attendance.edit permission before invoking this. */
export async function reviewLeaveApplication(
  institutionId: string, authUserId: string, userId: string, leaveId: string, decision: "approved" | "rejected"
): Promise<LeaveApplicationRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<LeaveApplicationRecord>(
      `update leave_applications set status = $1, reviewed_by = $2, reviewed_at = now()
         where id = $3 and status = 'pending'
       returning id, applicant_type, applicant_id, start_date, end_date, reason, status, reviewed_by, reviewed_at`,
      [decision, userId, leaveId]
    );
    if (rows.length === 0) return null;
    const leave = rows[0];
    await recordAudit(scoped, { institutionId, userId, action: decision, module: "attendance", entityType: "leave_applications", entityId: leaveId, after: leave });

    // §G.4 NotificationService generalizing beyond announcements (Phase 15):
    // resolve the polymorphic applicant_id (staff.id or students.id, per
    // the applicant_type check constraint) to the real users.id it's
    // linked to, and notify only if one exists — a staff member always has
    // one (createStaffMember() requires it), a student only has one if a
    // student portal account was ever provisioned (§Z, Phase 12), so a
    // missing link here is an expected, not exceptional, case.
    const { rows: linkedRows } = await scoped.query<{ user_id: string | null }>(
      leave.applicant_type === "staff"
        ? "select user_id from staff where id = $1"
        : "select user_id from students where id = $1",
      [leave.applicant_id]
    );
    const applicantUserId = linkedRows[0]?.user_id ?? null;
    if (applicantUserId) {
      await notifyUser(institutionId, authUserId, applicantUserId, {
        type: "leave_reviewed",
        title: decision === "approved" ? "Your leave application was approved" : "Your leave application was rejected",
        body: `Your leave request for ${leave.start_date} to ${leave.end_date} was ${decision}.`,
        relatedEntityType: "leave_applications", relatedEntityId: leaveId,
      }, scoped);
    }

    return leave;
  });
}

// ---------------------------------------------------------------------------
// §Page-4 follow-up: combined staff+student pending-leave widget (Dashboard)
// and the institution-wide daily attendance trend chart (Attendance page +
// Dashboard + Analysis hub).
// ---------------------------------------------------------------------------
export interface ReviewableLeaveRow {
  id: string; applicant_type: string; applicant_id: string; applicant_name: string;
  start_date: string; end_date: string; reason: string | null; status: string;
}

/** Every PENDING leave application (staff or student) this caller is
 *  actually allowed to review, name-resolved — the single source both the
 *  Dashboard's "Pending leave requests" widget and any other reviewer-facing
 *  summary read from, rather than each re-deriving the same
 *  unrestricted-vs-scoped rule canReviewLeaveApplication() already encodes
 *  per-row. Unrestricted (attendance.edit — institution_admin/management/
 *  "principal") reviewers see every pending row, staff and student alike.
 *  Scoped (attendance.leave.review_own_class — class teachers) reviewers see
 *  only pending STUDENT rows for students currently in one of their own
 *  assigned classes; they never see staff leave (§Page-4 "principal for
 *  staff...will approve" — a class teacher approving a colleague's leave was
 *  never part of the spec). Neither flag set returns an empty list rather
 *  than erroring, so a caller with no review rights just sees nothing. */
export async function getPendingLeaveApplicationsForReviewer(
  institutionId: string, authUserId: string, callerUserId: string,
  hasUnrestrictedEdit: boolean, hasScopedReview: boolean
): Promise<ReviewableLeaveRow[]> {
  if (!hasUnrestrictedEdit && !hasScopedReview) return [];
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ReviewableLeaveRow>(
      `select la.id, la.applicant_type, la.applicant_id,
              coalesce(s.full_name, stu.full_name, '—') as applicant_name,
              la.start_date, la.end_date, la.reason, la.status
         from leave_applications la
         left join students s on s.id = la.applicant_id and la.applicant_type = 'student'
         left join staff st on st.id = la.applicant_id and la.applicant_type = 'staff'
         left join users stu on stu.id = st.user_id
        where la.status = 'pending'
        order by la.created_at desc`
    );
    if (hasUnrestrictedEdit) return rows;
    // Scoped: only pending student rows the caller is class-teacher-of.
    const studentRows = rows.filter((r) => r.applicant_type === "student");
    const checks = await Promise.all(
      studentRows.map((r) => isClassTeacherOfStudent(institutionId, authUserId, callerUserId, r.applicant_id))
    );
    return studentRows.filter((_, i) => checks[i]);
  });
}

export interface AttendanceTrendPoint { date: string; presentPercent: number; totalMarked: number }

/** Institution-wide daily attendance trend, most recent `days` calendar
 *  days that actually have marked records (§Page-4 follow-up "Attendance
 *  analytics — growth and fall diagram, recent days"). Days with zero
 *  attendance_records rows (weekends, holidays, not-yet-taken) are skipped
 *  entirely rather than showing as a misleading 0% — mirrors
 *  getInstitutionPassRateTrend()'s "only count what actually happened"
 *  convention (modules/examination/service.ts). */
export async function getInstitutionAttendanceTrend(
  institutionId: string, authUserId: string, days = 14, scope?: AttendanceScope
): Promise<AttendanceTrendPoint[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ date: string; present: string; total: string }>(
      `select ar.date::text as date,
              count(*) filter (where ast.counts_as_present) as present,
              count(*) as total
         from attendance_records ar
         join attendance_statuses ast on ast.id = ar.status_id
         left join classes c on c.id = ar.class_id
        where ar.date >= current_date - ($1::int - 1)
          and ($2::uuid[] is null or ar.class_id = any($2))
          and ($3::text[] is null or c.stage = any($3))
        group by ar.date
        order by ar.date`,
      [days, scope?.classIds ?? null, scope?.stages ?? null]
    );
    return rows.map((r) => {
      const total = Number(r.total);
      const present = Number(r.present);
      return {
        date: r.date,
        totalMarked: total,
        presentPercent: total > 0 ? Math.round((present / total) * 10000) / 100 : 0,
      };
    });
  });
}
