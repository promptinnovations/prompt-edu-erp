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
import {
  listAttendanceStatuses, getAttendanceGrid, markAttendance,
  getStudentAttendanceSummary, applyForLeave, listLeaveApplications, reviewLeaveApplication,
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
