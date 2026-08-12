/**
 * PROMPT EDU ERP — Staff module flow (ARCHITECTURE.md §D.4/§D.3/§D.12,
 * Phase 10): staff directory creation (user account + membership + role +
 * staff record in one call), staff attendance marking (incl. the
 * null-period upsert fix), staff leave reusing the generic
 * leave_applications workflow, portion plan/completion tracking, teacher
 * observations, teacher assignments, permission boundaries, and tenant
 * isolation on every new table from migration 0012.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createClass, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { listAttendanceStatuses } from "../../modules/attendance/service";
import {
  createStaffMember, listStaff, getStaffMember, updateStaffMember,
  getStaffAttendanceGrid, markStaffAttendance, getStaffAttendanceSummary,
  applyForStaffLeave, listStaffLeaveApplications, reviewStaffLeave,
  createPortionPlan, listPortionPlans, recordPortionCompletion, listPortionCompletionHistory,
  recordTeacherObservation, listTeacherObservations,
  createTeacherAssignment, listTeacherAssignments, listAssignmentsForTeacher,
} from "../../modules/staff/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let managementAuth: string, managementUserId: string;
let teacherAuth: string, teacherUserId: string;
let teacher1Id: string; // staff.id
let teacher1UserId: string; // users.id (for teacher_assignments)
let presentStatusId: string;
let classId: string, subjectId: string, academicYearId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "staff-school-a");
  institutionB = await seedDemoInstitution(db, "staff-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@staff-a.example", "Staff Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const management = await seedDemoUser(db, institutionA, "mgmt@staff-a.example", "Staff Management", "management");
  managementAuth = management.authUserId; managementUserId = management.userId;

  const teacherUser = await seedDemoUser(db, institutionA, "teacher@staff-a.example", "Regular Teacher", "teacher");
  teacherAuth = teacherUser.authUserId; teacherUserId = teacherUser.userId;

  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  presentStatusId = statuses.find((s) => s.counts_as_present)!.id;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 5", sortOrder: 1 });
  classId = cls.id;
  const subj = await createSubject(institutionA, adminAuth, adminUserId, { name: "Arabic" });
  subjectId = subj.id;
  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  academicYearId = year!.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Staff directory (§D.4)", () => {
  it("createStaffMember() creates a user account, membership, role grant, and staff record in one call", async () => {
    const staff = await createStaffMember(institutionA, adminAuth, adminUserId, {
      email: "hoduri@staff-a.example", fullName: "Teacher Hoduri", staffCode: "T-001",
      designation: "Kithab Teacher", department: "Academics", joiningDate: "2020-06-01",
      employmentStatus: "active", roleCode: "teacher",
    });
    expect(staff.staff_code).toBe("T-001");
    teacher1Id = staff.id;
    teacher1UserId = staff.user_id;

    const perms = await getPermissionsForUser(adminAuth, teacher1UserId, institutionA);
    expect(perms.has("attendance.enter")).toBe(true); // teacher role grant took effect
  });

  it("listStaff()/getStaffMember() return the staff row joined with user info", async () => {
    const list = await listStaff(institutionA, adminAuth);
    expect(list.some((s) => s.staff_code === "T-001")).toBe(true);

    const fetched = await getStaffMember(institutionA, adminAuth, teacher1Id);
    expect(fetched?.full_name).toBe("Teacher Hoduri");
    expect(fetched?.email).toBe("hoduri@staff-a.example");
  });

  it("updateStaffMember() edits designation/department/employment_status", async () => {
    const updated = await updateStaffMember(institutionA, adminAuth, adminUserId, teacher1Id, {
      designation: "Senior Kithab Teacher", employmentStatus: "active",
    });
    expect(updated?.designation).toBe("Senior Kithab Teacher");
  });

  it("management (lacks staff.create) cannot create staff, teacher (lacks staff.edit) cannot edit", async () => {
    const managementPerms = await getPermissionsForUser(managementAuth, managementUserId, institutionA);
    expect(() => requirePermission(managementPerms, "staff.view")).not.toThrow();
    expect(() => requirePermission(managementPerms, "staff.create")).toThrow(/Forbidden/);

    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "staff.edit")).toThrow(/Forbidden/);
  });
});

describe("Staff attendance (§D.6, staff_attendance)", () => {
  it("markStaffAttendance() with a null period, called twice for the same date, upserts rather than duplicating", async () => {
    const first = await markStaffAttendance(institutionA, adminAuth, adminUserId, {
      date: "2026-08-03", entries: [{ staffId: teacher1Id, statusId: presentStatusId }],
    });
    expect(first.marked).toBe(1);

    const second = await markStaffAttendance(institutionA, adminAuth, adminUserId, {
      date: "2026-08-03", entries: [{ staffId: teacher1Id, statusId: presentStatusId }],
    });
    expect(second.marked).toBe(1);

    const db = await getDbClient();
    const count = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const { rows } = await scoped.query<{ n: string }>(
        "select count(*) as n from staff_attendance where staff_id = $1 and date = $2", [teacher1Id, "2026-08-03"]
      );
      return Number(rows[0].n);
    });
    expect(count).toBe(1); // proves the coalesce(period,'') upsert index works, not two rows
  });

  it("getStaffAttendanceGrid() shows the marked status for the date", async () => {
    const grid = await getStaffAttendanceGrid(institutionA, adminAuth, "2026-08-03");
    const row = grid.find((r) => r.staff_id === teacher1Id);
    expect(row?.status_id).toBe(presentStatusId);
  });

  it("getStaffAttendanceSummary() rolls up present/absent/total over a date range", async () => {
    await markStaffAttendance(institutionA, adminAuth, adminUserId, {
      date: "2026-08-04", entries: [{ staffId: teacher1Id, statusId: presentStatusId }],
    });
    const summary = await getStaffAttendanceSummary(institutionA, adminAuth, teacher1Id, "2026-08-01", "2026-08-31");
    expect(summary.total_days).toBe(2);
    expect(summary.present_days).toBe(2);
    expect(summary.present_percent).toBe(100);
  });
});

describe("Staff leave (reuses leave_applications, applicantType='staff')", () => {
  it("applyForStaffLeave() creates a leave_applications row with applicant_type='staff'", async () => {
    const leave = await applyForStaffLeave(institutionA, teacherAuth, teacher1UserId, {
      staffId: teacher1Id, startDate: "2026-09-01", endDate: "2026-09-03", reason: "Family event",
    });
    expect(leave.applicant_type).toBe("staff");
    expect(leave.status).toBe("pending");
  });

  it("listStaffLeaveApplications() filters to only staff applicants (never a student's leave)", async () => {
    const staffLeaves = await listStaffLeaveApplications(institutionA, adminAuth);
    expect(staffLeaves.length).toBeGreaterThan(0);
    expect(staffLeaves.every((l) => l.applicant_type === "staff")).toBe(true);
  });

  it("reviewStaffLeave() approves/rejects through the same generic workflow as student leave", async () => {
    const [pending] = await listStaffLeaveApplications(institutionA, adminAuth, "pending");
    const reviewed = await reviewStaffLeave(institutionA, adminAuth, adminUserId, pending.id, "approved");
    expect(reviewed?.status).toBe("approved");
  });
});

describe("Portion plans/completion (§D.12)", () => {
  let planId: string;

  it("createPortionPlan() records what a teacher must cover", async () => {
    const plan = await createPortionPlan(institutionA, adminAuth, adminUserId, {
      academicYearId, classId, subjectId, teacherId: teacher1Id,
      chapterName: "Chapter 3 — Sarf basics", plannedDate: "2026-08-20",
    });
    planId = plan.id;
    expect(plan.id).toBeTruthy();
  });

  it("listPortionPlans() shows null latest_completion_percent before any progress is logged", async () => {
    const plans = await listPortionPlans(institutionA, adminAuth, { teacherId: teacher1Id });
    const row = plans.find((p) => p.id === planId);
    expect(row?.latest_completion_percent).toBeNull();
    expect(row?.teacher_name).toBe("Teacher Hoduri");
  });

  it("recordPortionCompletion() logs progress; listPortionPlans() then surfaces the most recent one", async () => {
    await recordPortionCompletion(institutionA, teacherAuth, teacher1UserId, {
      portionPlanId: planId, completedDate: "2026-08-10", completionPercent: 40,
    });
    await recordPortionCompletion(institutionA, teacherAuth, teacher1UserId, {
      portionPlanId: planId, completedDate: "2026-08-18", completionPercent: 90, notes: "Almost done",
    });

    const plans = await listPortionPlans(institutionA, adminAuth, { classId, subjectId });
    const row = plans.find((p) => p.id === planId);
    expect(row?.latest_completion_percent).toBe(90);

    const history = await listPortionCompletionHistory(institutionA, adminAuth, planId);
    expect(history).toHaveLength(2);
    expect(history[0].completion_percent).toBe(90); // most recent first
  });

  it("teacher (has staff.portion.manage) can record completion; teacher without the permission cannot", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "staff.portion.manage")).not.toThrow();

    const librarian = await seedDemoUser(await getDbClient(), institutionA, "lib@staff-a.example", "Staff Librarian", "librarian");
    const librarianPerms = await getPermissionsForUser(librarian.authUserId, librarian.userId, institutionA);
    expect(() => requirePermission(librarianPerms, "staff.portion.manage")).toThrow(/Forbidden/);
  });
});

describe("Teacher observations (§D.12)", () => {
  it("recordTeacherObservation() records a free-form, institution-defined rubric via criteria_jsonb", async () => {
    const obs = await recordTeacherObservation(institutionA, managementAuth, managementUserId, {
      teacherId: teacher1Id, date: "2026-08-05",
      criteriaJsonb: { lessonPlanning: "good", classroomManagement: "excellent" },
      overallNotes: "Strong session, well-paced.",
    });
    expect(obs.teacher_id).toBe(teacher1Id);
    expect(obs.observer_id).toBe(managementUserId);
  });

  it("listTeacherObservations() filters by teacher", async () => {
    const observations = await listTeacherObservations(institutionA, managementAuth, teacher1Id);
    expect(observations).toHaveLength(1);
  });

  it("teacher (lacks staff.observation.manage) cannot record an observation of themselves or others", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "staff.observation.manage")).toThrow(/Forbidden/);
  });
});

describe("Teacher assignments (§D.3 — subject-teacher mapping)", () => {
  it("createTeacherAssignment() links a teacher's user_id to a class/subject", async () => {
    const assignment = await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
      userId: teacher1UserId, classId, subjectId, academicYearId, roleType: "subject_teacher",
    });
    expect(assignment.role_type).toBe("subject_teacher");
  });

  it("listTeacherAssignments() and listAssignmentsForTeacher() both surface it with joined names", async () => {
    const all = await listTeacherAssignments(institutionA, adminAuth, { academicYearId });
    expect(all.some((a) => a.teacher_name === "Teacher Hoduri" && a.subject_name === "Arabic")).toBe(true);

    const mine = await listAssignmentsForTeacher(institutionA, teacherAuth, teacher1UserId);
    expect(mine).toHaveLength(1);
    expect(mine[0].class_name).toBe("Grade 5");
  });
});

describe("Staff module tenant isolation (§E, extended to migration 0012 tables)", () => {
  it("Institution B cannot see Institution A's staff, portion plans, observations, or assignments", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@staff-b.example", "Staff B Admin");

    expect(await listStaff(institutionB, adminB.authUserId)).toHaveLength(0);
    expect(await listPortionPlans(institutionB, adminB.authUserId)).toHaveLength(0);
    expect(await listTeacherObservations(institutionB, adminB.authUserId)).toHaveLength(0);
    expect(await listTeacherAssignments(institutionB, adminB.authUserId)).toHaveLength(0);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from staff where id = $1", [teacher1Id]);
      expect(rows.rows).toHaveLength(0);
    });
  });
});
