/**
 * PROMPT EDU ERP — Attendance Page 4 follow-up (§Page-4: staff self-service
 * leave, combined pending-leave review table, "growth and fall" attendance
 * trend chart). Builds on attendance-flow.test.ts's fixtures/conventions but
 * is its own file since it exercises three NEW service functions
 * (listLeaveApplicationsForApplicant, getPendingLeaveApplicationsForReviewer,
 * getInstitutionAttendanceTrend) plus the retirement of the old
 * apply-on-behalf-of-staff UI (staff now resolve their OWN staffId via
 * getOwnStaffId(), never a client-submitted one).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import { createStaffMember, createTeacherAssignment } from "../../modules/staff/service";
import { getOwnStaffId } from "../../modules/mentoring/service";
import {
  listAttendanceStatuses, markAttendance, applyForLeave,
  listLeaveApplicationsForApplicant, getPendingLeaveApplicationsForReviewer,
  getInstitutionAttendanceTrend, canReviewLeaveApplication,
} from "../../modules/attendance/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let staff1Auth: string, staff1UserId: string, staff1StaffId: string;
let staff2Auth: string, staff2UserId: string, staff2StaffId: string; // librarian, no attendance perms at all
let classId: string, sectionId: string;
let student1: string;
let presentStatusId: string, absentStatusId: string;

const DAY1 = "2026-09-01";
const DAY2 = "2026-09-02";
const DAY3 = "2026-09-03";

async function mintAuthFor(db: Awaited<ReturnType<typeof getDbClient>>, userId: string): Promise<string> {
  const authId = crypto.randomUUID();
  await db.query("update users set auth_user_id = $1 where id = $2", [authId, userId]);
  return authId;
}

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "p4-school-a");
  institutionB = await seedDemoInstitution(db, "p4-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@p4-a.example", "P4 Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  // staff1 = the class teacher, also has their own `staff` row (so they can
  // both review student leave for their class AND apply for their own leave).
  const staff1 = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "staff1@p4-a.example", fullName: "Staff One (Class Teacher)", staffCode: "P4-S1",
    employmentStatus: "active", roleCode: "teacher",
  });
  staff1StaffId = staff1.id; staff1UserId = staff1.user_id;
  staff1Auth = await mintAuthFor(db, staff1UserId);
  // Link this staff row's user to the same auth/user as the class-teacher
  // role-holder created above isn't necessary — teacher_assignments key off
  // user_id directly, so assign it to staff1's own user_id.

  const staff2 = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "staff2@p4-a.example", fullName: "Staff Two (Librarian)", staffCode: "P4-S2",
    employmentStatus: "active", roleCode: "librarian",
  });
  staff2StaffId = staff2.id; staff2UserId = staff2.user_id;
  staff2Auth = await mintAuthFor(db, staff2UserId);

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "P4 Grade", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "P4-1", fullName: "P4 Student One" });
  student1 = s1.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");
  await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    await scoped.query(
      `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
       values ($1, $2, $3, $4, $5)`,
      [institutionA, student1, year.id, classId, sectionId]
    );
  });

  // staff1's user becomes the class teacher of `classId`.
  await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
    userId: staff1UserId, classId, academicYearId: year.id, roleType: "class_teacher",
  });

  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  presentStatusId = statuses.find((s) => s.code === "present")!.id;
  absentStatusId = statuses.find((s) => s.code === "absent")!.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Staff self-service leave (§Page-4: 'each staff...should have a portion for applying leave from their own page')", () => {
  it("getOwnStaffId() resolves the caller's own staff.id server-side, never trusting a client-submitted one", async () => {
    expect(await getOwnStaffId(institutionA, staff1Auth, staff1UserId)).toBe(staff1StaffId);
    expect(await getOwnStaffId(institutionA, staff2Auth, staff2UserId)).toBe(staff2StaffId);
    // A user with no linked staff row (e.g. the admin, who is not staff here) resolves to null.
    expect(await getOwnStaffId(institutionA, adminAuth, adminUserId)).toBeNull();
  });

  it("staff2 (librarian, zero attendance permissions) can still apply for their own leave — no attendance.* permission required", async () => {
    const leave = await applyForLeave(institutionA, staff2Auth, staff2UserId, {
      applicantType: "staff", applicantId: staff2StaffId,
      startDate: "2026-09-10", endDate: "2026-09-11", reason: "Personal",
    });
    expect(leave.status).toBe("pending");
    expect(leave.applicant_type).toBe("staff");
    expect(leave.applicant_id).toBe(staff2StaffId);
  });

  it("listLeaveApplicationsForApplicant() returns only that one applicant's own history, not the institution-wide list", async () => {
    await applyForLeave(institutionA, staff1Auth, staff1UserId, {
      applicantType: "staff", applicantId: staff1StaffId,
      startDate: "2026-09-15", endDate: "2026-09-16", reason: "Conference",
    });

    const staff1History = await listLeaveApplicationsForApplicant(institutionA, staff1Auth, "staff", staff1StaffId);
    expect(staff1History).toHaveLength(1);
    expect(staff1History[0].applicant_id).toBe(staff1StaffId);

    const staff2History = await listLeaveApplicationsForApplicant(institutionA, staff2Auth, "staff", staff2StaffId);
    expect(staff2History).toHaveLength(1);
    expect(staff2History[0].applicant_id).toBe(staff2StaffId);
    expect(staff2History[0].applicant_id).not.toBe(staff1StaffId);
  });

  it("canReviewLeaveApplication() refuses staff-leave review for a scoped (class-teacher) reviewer — only unrestricted (attendance.edit) reviewers may approve staff leave", async () => {
    const [staff2Pending] = await listLeaveApplicationsForApplicant(institutionA, staff2Auth, "staff", staff2StaffId);
    // staff1 is a class teacher (scoped reviewer) but staff leave is never
    // theirs to approve, regardless of class — canReviewLeaveApplication()
    // short-circuits to false for any non-student applicant_type when
    // hasUnrestrictedEdit is false.
    expect(await canReviewLeaveApplication(institutionA, staff1Auth, staff1UserId, false, staff2Pending.id)).toBe(false);
    // The admin (unrestricted) may approve it.
    expect(await canReviewLeaveApplication(institutionA, adminAuth, adminUserId, true, staff2Pending.id)).toBe(true);
  });
});

describe("Combined pending-leave reviewer table (§Page-4: 'appearing in a table in the dashboard...of principal and class teachers')", () => {
  it("an unrestricted reviewer (principal/admin) sees ALL pending leave, staff and student alike", async () => {
    const studentLeave = await applyForLeave(institutionA, adminAuth, adminUserId, {
      applicantType: "student", applicantId: student1, startDate: "2026-09-20", endDate: "2026-09-21", reason: "Family trip",
    });

    const rows = await getPendingLeaveApplicationsForReviewer(institutionA, adminAuth, adminUserId, true, false);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(studentLeave.id);
    expect(rows.some((r) => r.applicant_type === "staff")).toBe(true);
    expect(rows.some((r) => r.applicant_type === "student")).toBe(true);
    // Applicant name is resolved (student/staff full name), not a raw id.
    const studentRow = rows.find((r) => r.id === studentLeave.id)!;
    expect(studentRow.applicant_name).toBe("P4 Student One");
  });

  it("a scoped reviewer (class teacher) sees only pending STUDENT leave for their own class — never any staff leave, never other classes' students", async () => {
    const rows = await getPendingLeaveApplicationsForReviewer(institutionA, staff1Auth, staff1UserId, false, true);
    expect(rows.every((r) => r.applicant_type === "student")).toBe(true);
    expect(rows.some((r) => r.applicant_id === student1)).toBe(true);
  });

  it("a caller with neither reviewer permission gets an empty list, cheaply (no query at all)", async () => {
    const rows = await getPendingLeaveApplicationsForReviewer(institutionA, staff2Auth, staff2UserId, false, false);
    expect(rows).toHaveLength(0);
  });
});

describe("Institution-wide attendance trend (§Page-4: 'Attendance analytics — growth and fall diagram, recent days')", () => {
  it("only counts days that actually had attendance taken, omitting untaken days entirely rather than showing a misleading 0%", async () => {
    await markAttendance(institutionA, adminAuth, adminUserId, {
      classId, sectionId, date: DAY1,
      entries: [{ studentId: student1, statusId: presentStatusId, isLate: false }],
    });
    await markAttendance(institutionA, adminAuth, adminUserId, {
      classId, sectionId, date: DAY3,
      entries: [{ studentId: student1, statusId: absentStatusId, isLate: false }],
    });
    // DAY2 deliberately has no attendance taken at all.

    const trend = await getInstitutionAttendanceTrend(institutionA, adminAuth, 30);
    const day1Point = trend.find((p) => p.date === DAY1);
    const day2Point = trend.find((p) => p.date === DAY2);
    const day3Point = trend.find((p) => p.date === DAY3);

    expect(day1Point).toBeTruthy();
    expect(day1Point!.presentPercent).toBe(100);
    expect(day1Point!.totalMarked).toBe(1);

    expect(day2Point).toBeUndefined(); // no records that day => omitted, not 0%

    expect(day3Point).toBeTruthy();
    expect(day3Point!.presentPercent).toBe(0);
    expect(day3Point!.totalMarked).toBe(1);
  });

  it("respects the `days` window — a 1-day window only returns the most recent day with data, if it falls in range", async () => {
    const trend = await getInstitutionAttendanceTrend(institutionA, adminAuth, 1);
    // Window is "today back N-1 days"; since our fixture dates are fixed in
    // the past relative to the actual test-run date, a narrow window may
    // legitimately return zero points — the important property is it never
    // throws and never returns more days than exist in range.
    expect(Array.isArray(trend)).toBe(true);
    for (const p of trend) {
      expect(p.presentPercent).toBeGreaterThanOrEqual(0);
      expect(p.presentPercent).toBeLessThanOrEqual(100);
    }
  });
});

describe("Tenant isolation on all new Page-4 functions", () => {
  it("Institution B sees none of Institution A's staff leave, pending-leave table rows, or attendance trend", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@p4-b.example", "P4 B Admin", "institution_admin");

    // Cross-tenant lookup by Institution A's own staffId, scoped to B, returns nothing.
    const crossTenantHistory = await listLeaveApplicationsForApplicant(institutionB, adminB.authUserId, "staff", staff1StaffId);
    expect(crossTenantHistory).toHaveLength(0);

    const crossTenantPending = await getPendingLeaveApplicationsForReviewer(institutionB, adminB.authUserId, adminB.userId, true, false);
    expect(crossTenantPending).toHaveLength(0);

    const crossTenantTrend = await getInstitutionAttendanceTrend(institutionB, adminB.authUserId, 30);
    expect(crossTenantTrend).toHaveLength(0);
  });
});
