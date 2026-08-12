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
