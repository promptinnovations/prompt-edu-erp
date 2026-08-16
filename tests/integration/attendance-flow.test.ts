/**
 * PROMPT EDU ERP — Attendance module flow (ARCHITECTURE.md §D.6, Phase 4):
 * mark attendance for a class/section/date -> summary calc -> leave
 * application + approval, with permission boundaries (teacher can mark
 * attendance but not review leave applications) and tenant isolation on
 * every new table introduced by migration 0006.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import { createTeacherAssignment } from "../../modules/staff/service";
import { provisionStudentPortalAccount } from "../../modules/portal/service";
import {
  listAttendanceStatuses, getAttendanceGrid, markAttendance,
  getStudentAttendanceSummary, applyForLeave, listLeaveApplications, reviewLeaveApplication,
  getAttendanceAlertCandidates, sendAttendanceAlerts, isClassTeacherOfStudent, canReviewLeaveApplication,
  getDailyAttendanceOverview, listLeaveApplicationsForClassOnDate,
} from "../../modules/attendance/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let classId: string, sectionId: string;
let student1: string, student2: string;
let presentStatusId: string, absentStatusId: string, lateStatusId: string;

const DAY1 = "2026-06-02";
const DAY2 = "2026-06-03";
const DAY3 = "2026-06-04";

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "att-school-a");
  institutionB = await seedDemoInstitution(db, "att-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@att-a.example", "Attendance Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const teacher = await seedDemoUser(db, institutionA, "teacher@att-a.example", "Attendance Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 4", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "AT-1", fullName: "Student One" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "AT-2", fullName: "Student Two" });
  student1 = s1.id; student2 = s2.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const dbForEnroll = await getDbClient();
  await dbForEnroll.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    for (const sid of [student1, student2]) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
         values ($1, $2, $3, $4, $5)`,
        [institutionA, sid, year.id, classId, sectionId]
      );
    }
  });

  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  presentStatusId = statuses.find((s) => s.code === "present")!.id;
  absentStatusId = statuses.find((s) => s.code === "absent")!.id;
  lateStatusId = statuses.find((s) => s.code === "late")!.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Attendance workflow (§D.6)", () => {
  it("seeds exactly one default attendance status per institution (§36)", async () => {
    const statuses = await listAttendanceStatuses(institutionA, adminAuth);
    const defaults = statuses.filter((s) => s.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].code).toBe("present");
  });

  it("the attendance grid lists enrolled students with no record yet", async () => {
    const grid = await getAttendanceGrid(institutionA, adminAuth, classId, sectionId, DAY1);
    expect(grid).toHaveLength(2);
    expect(grid.every((r) => r.record_id === null)).toBe(true);
  });

  it("teacher can mark attendance (has attendance.enter) but not review leave applications (lacks attendance.edit)", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "attendance.enter")).not.toThrow();
    expect(() => requirePermission(teacherPerms, "attendance.edit")).toThrow(/Forbidden/);

    const result = await markAttendance(institutionA, teacherAuth, teacherUserId, {
      classId, sectionId, date: DAY1,
      entries: [
        { studentId: student1, statusId: presentStatusId, isLate: false },
        { studentId: student2, statusId: absentStatusId, isLate: false },
      ],
    });
    expect(result.marked).toBe(2);
  });

  it("re-marking the same student/date upserts rather than duplicating (unique institution_id, student_id, date)", async () => {
    await markAttendance(institutionA, teacherAuth, teacherUserId, {
      classId, sectionId, date: DAY1,
      entries: [{ studentId: student2, statusId: lateStatusId, isLate: true, lateMinutes: 15 }],
    });
    const grid = await getAttendanceGrid(institutionA, adminAuth, classId, sectionId, DAY1);
    const row = grid.find((r) => r.student_id === student2)!;
    expect(row.status_id).toBe(lateStatusId);
    expect(row.is_late).toBe(true);
    expect(row.late_minutes).toBe(15);
  });

  it("marks a second day so summaries have more than one day of data", async () => {
    const result = await markAttendance(institutionA, teacherAuth, teacherUserId, {
      classId, sectionId, date: DAY2,
      entries: [
        { studentId: student1, statusId: presentStatusId, isLate: false },
        { studentId: student2, statusId: presentStatusId, isLate: false },
      ],
    });
    expect(result.marked).toBe(2);
  });

  it("getStudentAttendanceSummary() correctly rolls up counts_as_present across the date range", async () => {
    const summary = await getStudentAttendanceSummary(institutionA, adminAuth, student2, DAY1, DAY2);
    expect(summary.total_days).toBe(2);
    expect(summary.present_days).toBe(2); // 'late' counts_as_present=true on day1, 'present' on day2
    expect(summary.absent_days).toBe(0);
    expect(summary.late_days).toBe(1);
    expect(summary.present_percent).toBeCloseTo(100, 5);

    const summary1 = await getStudentAttendanceSummary(institutionA, adminAuth, student1, DAY1, DAY2);
    expect(summary1.total_days).toBe(2);
    expect(summary1.present_days).toBe(2);
    expect(summary1.present_percent).toBeCloseTo(100, 5);
  });

  it("applyForLeave() creates a pending leave application", async () => {
    const leave = await applyForLeave(institutionA, teacherAuth, teacherUserId, {
      applicantType: "student", applicantId: student1,
      startDate: "2026-06-10", endDate: "2026-06-12", reason: "Family function",
    });
    expect(leave.status).toBe("pending");

    const list = await listLeaveApplications(institutionA, adminAuth);
    expect(list.some((l) => l.id === leave.id)).toBe(true);
  });

  it("reviewLeaveApplication() approves a pending application exactly once", async () => {
    const [pending] = await listLeaveApplications(institutionA, adminAuth, "pending");
    expect(pending).toBeTruthy();

    const approved = await reviewLeaveApplication(institutionA, adminAuth, adminUserId, pending.id, "approved");
    expect(approved?.status).toBe("approved");

    // Re-reviewing an already-decided application is a no-op (only 'pending' rows transition).
    const secondAttempt = await reviewLeaveApplication(institutionA, adminAuth, adminUserId, pending.id, "rejected");
    expect(secondAttempt).toBeNull();

    const list = await listLeaveApplications(institutionA, adminAuth);
    expect(list.find((l) => l.id === pending.id)?.status).toBe("approved");
  });
});

describe("Attendance tenant isolation (§E, extended to migration 0006 tables)", () => {
  it("Institution B cannot see Institution A's attendance statuses, records, or leave applications", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@att-b.example", "Attendance B Admin");

    const statusesB = await listAttendanceStatuses(institutionB, adminB.authUserId);
    // Institution B has its own independently-seeded 'present' status with a different id.
    const statusesA = await listAttendanceStatuses(institutionA, adminAuth);
    expect(statusesB.find((s) => s.code === "present")?.id).not.toBe(statusesA.find((s) => s.code === "present")?.id);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const records = await scoped.query("select id from attendance_records where class_id = $1", [classId]);
      expect(records.rows).toHaveLength(0);

      const leaves = await scoped.query("select id from leave_applications where applicant_id = $1", [student1]);
      expect(leaves.rows).toHaveLength(0);
    });
  });

  it("an ID-enumeration attempt against Institution A's grid from Institution B's context returns nothing", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin2@att-b.example", "Attendance B Admin 2");
    const grid = await getAttendanceGrid(institutionB, adminB.authUserId, classId, sectionId, DAY1);
    expect(grid).toHaveLength(0);
  });
});

describe("Attendance alerts (§D.6 follow-up: absentee/late-coming WhatsApp preview + confirm)", () => {
  let student1UserId: string;

  it("getAttendanceAlertCandidates() only returns absent/late students, with phone resolved from a linked portal login", async () => {
    // student1 gets a portal login (and therefore a phone, via
    // set_login_credentials — mirrors createStudentLoginAccount's real
    // shape) so it can be an alert TARGET; student2 stays login-less on
    // purpose, to exercise the "no phone on file" branch below.
    const provisioned = await provisionStudentPortalAccount(institutionA, adminAuth, adminUserId, {
      studentId: student1, email: "student1-alerts@att-a.example", fullName: "Student One",
    });
    student1UserId = provisioned.userId;
    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      await scoped.query("select set_login_credentials($1, null, $2)", [student1UserId, "9999900001"]);
    });

    // DAY1 already has student1=present, student2=late (15 min) from the
    // earlier describe block — exactly one alert candidate expected.
    const candidates = await getAttendanceAlertCandidates(institutionA, adminAuth, classId, sectionId, DAY1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].studentId).toBe(student2);
    expect(candidates[0].isLate).toBe(true);
    expect(candidates[0].phone).toBeNull(); // student2 has no portal login
    expect(candidates[0].defaultMessage).toMatch(/LATE/);
  });

  it("marking student1 absent produces a candidate with its resolved phone number", async () => {
    await markAttendance(institutionA, teacherAuth, teacherUserId, {
      classId, sectionId, date: DAY3,
      entries: [
        { studentId: student1, statusId: absentStatusId, isLate: false },
        { studentId: student2, statusId: presentStatusId, isLate: false },
      ],
    });
    const candidates = await getAttendanceAlertCandidates(institutionA, adminAuth, classId, sectionId, DAY3);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].studentId).toBe(student1);
    expect(candidates[0].countsAsPresent).toBe(false);
    expect(candidates[0].phone).toBe("9999900001");
    expect(candidates[0].defaultMessage).toMatch(/ABSENT/);
  });

  it("sendAttendanceAlerts() sends for a student with a linked phone, and reports (not throws) for one without", async () => {
    const results = await sendAttendanceAlerts(institutionA, adminAuth, adminUserId, {
      alerts: [
        { studentId: student1, message: "Test alert for student1" },
        { studentId: student2, message: "Test alert for student2" },
      ],
    });
    const r1 = results.find((r) => r.studentId === student1)!;
    const r2 = results.find((r) => r.studentId === student2)!;
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toMatch(/No portal login/);
  });

  it("class-teacher scoping: isClassTeacherOfStudent()/canReviewLeaveApplication() are false before an assignment exists, true after", async () => {
    expect(await isClassTeacherOfStudent(institutionA, teacherAuth, teacherUserId, student1)).toBe(false);

    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
      userId: teacherUserId, classId, academicYearId: year!.id, roleType: "class_teacher",
    });
    expect(await isClassTeacherOfStudent(institutionA, teacherAuth, teacherUserId, student1)).toBe(true);

    // A student with no enrollment at all is never "in" any class teacher's class.
    const unenrolled = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "AT-3", fullName: "Student Three" });
    expect(await isClassTeacherOfStudent(institutionA, teacherAuth, teacherUserId, unenrolled.id)).toBe(false);

    const leave = await applyForLeave(institutionA, adminAuth, adminUserId, {
      applicantType: "student", applicantId: student1, startDate: "2026-07-01", endDate: "2026-07-02", reason: "Test",
    });
    expect(await canReviewLeaveApplication(institutionA, teacherAuth, teacherUserId, false, leave.id)).toBe(true);

    const outsideLeave = await applyForLeave(institutionA, adminAuth, adminUserId, {
      applicantType: "student", applicantId: unenrolled.id, startDate: "2026-07-01", endDate: "2026-07-02", reason: "Test",
    });
    expect(await canReviewLeaveApplication(institutionA, teacherAuth, teacherUserId, false, outsideLeave.id)).toBe(false);
    // Unrestricted (attendance.edit) callers can always review, regardless of class.
    expect(await canReviewLeaveApplication(institutionA, adminAuth, adminUserId, true, outsideLeave.id)).toBe(true);
  });

  it("listLeaveApplicationsForClassOnDate() only returns leaves whose date range covers the given date, for that class", async () => {
    const inRange = await listLeaveApplicationsForClassOnDate(institutionA, adminAuth, classId, "2026-07-01");
    expect(inRange.some((l) => l.applicant_id === student1)).toBe(true);

    const outOfRange = await listLeaveApplicationsForClassOnDate(institutionA, adminAuth, classId, "2026-08-01");
    expect(outOfRange.some((l) => l.applicant_id === student1)).toBe(false);
  });

  it("getDailyAttendanceOverview() rolls up enrolled/marked/present/absent/late per section and lists absentees", async () => {
    const overview = await getDailyAttendanceOverview(institutionA, adminAuth, DAY3);
    const row = overview.classes.find((c) => c.sectionId === sectionId)!;
    expect(row.enrolled).toBe(2); // student1 + student2 — "Student Three" from the previous test was never enrolled anywhere
    expect(row.marked).toBe(2);
    expect(row.absent).toBe(1);
    expect(row.present).toBe(1);
    expect(overview.absentees.some((a) => a.studentId === student1)).toBe(true);
  });
});
