/**
 * PROMPT EDU ERP — Home page redesign follow-up: Academic Calendar module,
 * Substitution module (timetable + auto-generated suggestions + confirmed
 * record + weekly/monthly report), personal To-do list, institution-wide
 * pass-rate trend, and the Home page's aggregate service functions.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createStaffMember } from "../../modules/staff/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, computeResults,
  getInstitutionPassRateTrend, getMostRecentExamination,
} from "../../modules/examination/service";
import {
  createCalendarEvent, listCalendarEvents, listUpcomingCalendarEvents, deleteCalendarEvent,
} from "../../modules/calendar/service";
import {
  upsertTimetablePeriod, listTimetable, generateSubstitutionSuggestions,
  confirmSubstitutions, listSubstitutions, deleteSubstitution, getSubstitutionReport, isoDayOfWeek,
} from "../../modules/substitution/service";
import { addTodo, listMyTodos, toggleTodo, deleteTodo } from "../../services/todo/todo-service";
import { getInstitutionStats, getTodayAttendanceSummary, getUpcomingItems } from "../../services/home/home-service";

let institutionA: string, institutionB: string;
let adminAuth: string, adminUserId: string;
let teacher1Auth: string, teacher1UserId: string, teacher1StaffId: string;
let teacher2StaffId: string;
let classId: string, sectionId: string, mathId: string, scienceId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "home-school-a");
  institutionB = await seedDemoInstitution(db, "home-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@home-a.example", "Home Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const teacher1 = await seedDemoUser(db, institutionA, "teacher1@home-a.example", "Teacher One", "teacher");
  teacher1Auth = teacher1.authUserId; teacher1UserId = teacher1.userId;
  await seedDemoUser(db, institutionA, "teacher2@home-a.example", "Teacher Two", "teacher");

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 7", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;
  const math = await createSubject(institutionA, adminAuth, adminUserId, { name: "Mathematics" });
  mathId = math.id;
  const science = await createSubject(institutionA, adminAuth, adminUserId, { name: "Science" });
  scienceId = science.id;

  // Separate staff records (their own user accounts) from the seeded
  // teacher1/teacher2 auth users above — createStaffMember() always
  // provisions a fresh user account and can't attach to an email that
  // already has one, and this suite only needs teacher1's staff record to
  // be a genuine "teaching staff" row in timetable_periods, not the same
  // account teacher1Auth signs in as.
  const staff1 = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "staff1@home-a.example", fullName: "Teacher One", staffCode: "HT-001",
    designation: "Teacher", department: null, employmentStatus: "active",
  });
  teacher1StaffId = staff1.id;
  const staff2 = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "staff2@home-a.example", fullName: "Teacher Two", staffCode: "HT-002",
    designation: "Teacher", department: null, employmentStatus: "active",
  });
  teacher2StaffId = staff2.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Academic Calendar", () => {
  let eventId: string;

  it("createCalendarEvent() + listCalendarEvents()", async () => {
    const e = await createCalendarEvent(institutionA, adminAuth, adminUserId, {
      title: "Summer Vacation", eventType: "holiday", startDate: "2099-04-01", endDate: "2099-05-31",
    });
    eventId = e.id;
    const all = await listCalendarEvents(institutionA, adminAuth);
    expect(all.some((x) => x.id === eventId)).toBe(true);
  });

  it("listUpcomingCalendarEvents() only returns not-yet-finished events", async () => {
    await createCalendarEvent(institutionA, adminAuth, adminUserId, {
      title: "Long-past holiday", eventType: "holiday", startDate: "2000-01-01", endDate: "2000-01-10",
    });
    const upcoming = await listUpcomingCalendarEvents(institutionA, adminAuth, 20);
    expect(upcoming.some((x) => x.title === "Summer Vacation")).toBe(true);
    expect(upcoming.some((x) => x.title === "Long-past holiday")).toBe(false);
  });

  it("rejects an end date before the start date", async () => {
    await expect(
      createCalendarEvent(institutionA, adminAuth, adminUserId, { title: "Bad range", eventType: "other", startDate: "2099-06-01", endDate: "2099-05-01" })
    ).rejects.toThrow(/End date cannot be before start date/);
  });

  it("deleteCalendarEvent() removes it", async () => {
    await deleteCalendarEvent(institutionA, adminAuth, adminUserId, eventId);
    const all = await listCalendarEvents(institutionA, adminAuth);
    expect(all.some((x) => x.id === eventId)).toBe(false);
  });

  it("tenant isolation: institution B sees none of A's events", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@home-b.example", "Home B Admin");
    const eventsB = await listCalendarEvents(institutionB, adminB.authUserId);
    expect(eventsB).toHaveLength(0);
  });
});

describe("Substitution: timetable + auto-generated suggestions + confirmed record", () => {
  it("upsertTimetablePeriod() builds the weekly grid, listTimetable() reads it back", async () => {
    // Monday (1), periods 1-2 for Teacher One in Grade 7 A.
    await upsertTimetablePeriod(institutionA, adminAuth, adminUserId, {
      classId, sectionId, dayOfWeek: 1, periodNo: 1, subjectId: mathId, teacherStaffId: teacher1StaffId,
    });
    await upsertTimetablePeriod(institutionA, adminAuth, adminUserId, {
      classId, sectionId, dayOfWeek: 1, periodNo: 2, subjectId: scienceId, teacherStaffId: teacher1StaffId,
    });
    // Teacher Two is free at period 1 and 2 on Monday (teaches a different slot).
    await upsertTimetablePeriod(institutionA, adminAuth, adminUserId, {
      classId, sectionId, dayOfWeek: 1, periodNo: 3, subjectId: mathId, teacherStaffId: teacher2StaffId,
    });

    const timetable = await listTimetable(institutionA, adminAuth);
    expect(timetable).toHaveLength(3);
    expect(timetable.find((p) => p.periodNo === 1)?.teacherName).toBe("Teacher One");
  });

  it("upsert is ON CONFLICT DO UPDATE — re-uploading the same slot replaces it, not duplicates", async () => {
    await upsertTimetablePeriod(institutionA, adminAuth, adminUserId, {
      classId, sectionId, dayOfWeek: 1, periodNo: 1, subjectId: mathId, teacherStaffId: teacher1StaffId,
    });
    const timetable = await listTimetable(institutionA, adminAuth);
    expect(timetable).toHaveLength(3); // still 3, not 4
  });

  it("isoDayOfWeek() maps a known Monday date to 1", () => {
    // 2099-01-05 is a Monday.
    expect(isoDayOfWeek("2099-01-05")).toBe(1);
  });

  it("generateSubstitutionSuggestions() finds Teacher One's Monday periods and suggests a free teacher", async () => {
    const suggestions = await generateSubstitutionSuggestions(institutionA, adminAuth, teacher1StaffId, "2099-01-05");
    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((s) => s.suggestedCoveringStaffId === teacher2StaffId)).toBe(true);
    expect(suggestions[0].freeStaffOptions.some((o) => o.id === teacher2StaffId)).toBe(true);
  });

  it("a teacher with no periods that day gets zero suggestions", async () => {
    const suggestions = await generateSubstitutionSuggestions(institutionA, adminAuth, teacher2StaffId, "2099-01-06"); // Tuesday
    expect(suggestions).toHaveLength(0);
  });

  it("confirmSubstitutions() persists the (possibly edited) rows; listSubstitutions() reads them back", async () => {
    const suggestions = await generateSubstitutionSuggestions(institutionA, adminAuth, teacher1StaffId, "2099-01-05");
    await confirmSubstitutions(institutionA, adminAuth, adminUserId, {
      date: "2099-01-05",
      absentStaffId: teacher1StaffId,
      rows: suggestions.map((s) => ({ classId: s.classId, sectionId: s.sectionId, periodNo: s.periodNo, subjectId: s.subjectId, coveringStaffId: s.suggestedCoveringStaffId })),
    });
    const recorded = await listSubstitutions(institutionA, adminAuth, { from: "2099-01-05", to: "2099-01-05" });
    expect(recorded).toHaveLength(2);
    expect(recorded.every((r) => r.coveringStaffName === "Teacher Two")).toBe(true);
  });

  it("re-confirming the same date/slot (editable, regeneratable) UPSERTs rather than duplicating", async () => {
    await confirmSubstitutions(institutionA, adminAuth, adminUserId, {
      date: "2099-01-05", absentStaffId: teacher1StaffId,
      rows: [{ classId, sectionId, periodNo: 1, subjectId: mathId, coveringStaffId: null, note: "No substitute could be found this time" }],
    });
    const recorded = await listSubstitutions(institutionA, adminAuth, { from: "2099-01-05", to: "2099-01-05" });
    expect(recorded).toHaveLength(2); // still 2, period 1 updated in place
    expect(recorded.find((r) => r.periodNo === 1)?.coveringStaffId).toBeNull();
  });

  it("refuses to confirm the absent teacher as their own substitute", async () => {
    await expect(
      confirmSubstitutions(institutionA, adminAuth, adminUserId, {
        date: "2099-01-05", absentStaffId: teacher1StaffId,
        rows: [{ classId, sectionId, periodNo: 2, subjectId: scienceId, coveringStaffId: teacher1StaffId }],
      })
    ).rejects.toThrow(/cannot be the same/);
  });

  it("getSubstitutionReport() counts subs given/needed per staff member over a date range", async () => {
    const report = await getSubstitutionReport(institutionA, adminAuth, "2099-01-01", "2099-01-31");
    const teacher1Row = report.find((r) => r.staffId === teacher1StaffId);
    const teacher2Row = report.find((r) => r.staffId === teacher2StaffId);
    expect(teacher1Row?.subsNeeded).toBe(2);
    expect(teacher2Row?.subsGiven).toBe(1); // period 1 was cleared to no substitute in the re-confirm above
  });

  it("deleteSubstitution() removes a confirmed record", async () => {
    const recorded = await listSubstitutions(institutionA, adminAuth, { from: "2099-01-05", to: "2099-01-05" });
    await deleteSubstitution(institutionA, adminAuth, adminUserId, recorded[0].id);
    const after = await listSubstitutions(institutionA, adminAuth, { from: "2099-01-05", to: "2099-01-05" });
    expect(after).toHaveLength(1);
  });

  it("teacher role has substitution.view but not substitution.manage or substitution.timetable.manage", async () => {
    const teacherPerms = await getPermissionsForUser(teacher1Auth, teacher1UserId, institutionA);
    expect(() => requirePermission(teacherPerms, "substitution.view")).not.toThrow();
    expect(() => requirePermission(teacherPerms, "substitution.manage")).toThrow(/Forbidden/);
    expect(() => requirePermission(teacherPerms, "substitution.timetable.manage")).toThrow(/Forbidden/);
  });

  it("tenant isolation: institution B has no timetable and no substitutions from A", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin2@home-b.example", "Home B Admin 2");
    const timetableB = await listTimetable(institutionB, adminB.authUserId);
    expect(timetableB).toHaveLength(0);
    const subsB = await listSubstitutions(institutionB, adminB.authUserId);
    expect(subsB).toHaveLength(0);
  });
});

describe("Personal To-do list (self-scoped)", () => {
  it("addTodo() + listMyTodos() only returns the caller's own todos", async () => {
    await addTodo(institutionA, adminAuth, adminUserId, { text: "Review admissions" });
    await addTodo(institutionA, teacher1Auth, teacher1UserId, { text: "Prepare Monday's lesson plan" });

    const adminTodos = await listMyTodos(institutionA, adminAuth, adminUserId);
    const teacherTodos = await listMyTodos(institutionA, teacher1Auth, teacher1UserId);
    expect(adminTodos.map((t) => t.text)).toContain("Review admissions");
    expect(adminTodos.map((t) => t.text)).not.toContain("Prepare Monday's lesson plan");
    expect(teacherTodos.map((t) => t.text)).toContain("Prepare Monday's lesson plan");
  });

  it("toggleTodo() only affects a todo the caller owns", async () => {
    const [todo] = await listMyTodos(institutionA, adminAuth, adminUserId);
    await toggleTodo(institutionA, adminAuth, adminUserId, todo.id);
    const after = await listMyTodos(institutionA, adminAuth, adminUserId);
    expect(after.find((t) => t.id === todo.id)?.is_done).toBe(true);

    // Teacher One cannot toggle the admin's todo (userId-scoped WHERE clause — 0 rows affected).
    await toggleTodo(institutionA, teacher1Auth, teacher1UserId, todo.id);
    const stillAfter = await listMyTodos(institutionA, adminAuth, adminUserId);
    expect(stillAfter.find((t) => t.id === todo.id)?.is_done).toBe(true); // unchanged, not flipped back
  });

  it("deleteTodo() removes only the caller's own row", async () => {
    const before = await listMyTodos(institutionA, adminAuth, adminUserId);
    await deleteTodo(institutionA, adminAuth, adminUserId, before[0].id);
    const after = await listMyTodos(institutionA, adminAuth, adminUserId);
    expect(after).toHaveLength(before.length - 1);
  });
});

describe("Institution-wide pass rate trend + Home page aggregates", () => {
  let examinationId: string;
  let studentPass: string, studentFail: string;

  it("set up an examination with computed results (one pass, one fail)", async () => {
    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    if (!year) throw new Error("expected seeded current academic year");

    const sp = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "H-1", fullName: "Passing Student" });
    const sf = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "H-2", fullName: "Failing Student" });
    studentPass = sp.id; studentFail = sf.id;
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: studentPass, classId, sectionId, academicYearId: year.id });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: studentFail, classId, sectionId, academicYearId: year.id });

    const examTypes = await listExamTypes(institutionA, adminAuth);
    const examType = examTypes.find((t) => t.code === "academic_main")!;
    const examination = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId: year.id, name: "Home Widget Test Exam",
    });
    examinationId = examination.id;
    await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);
    const examSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: mathId, maxMarks: 100, passMarks: 35 });

    await enterMarks(institutionA, adminAuth, adminUserId, examSubject.id, [
      { studentId: studentPass, marksObtained: 80, isAbsent: false },
      { studentId: studentFail, marksObtained: 20, isAbsent: false },
    ]);
    await submitMarks(institutionA, adminAuth, examSubject.id, adminUserId);
    await verifyMarks(institutionA, adminAuth, examSubject.id, adminUserId);
    await approveMarks(institutionA, adminAuth, examSubject.id, adminUserId);
    const outcome = await computeResults(institutionA, adminAuth, examinationId);
    expect(outcome.computed).toBe(2);
  });

  it("getMostRecentExamination() returns the latest-created examination", async () => {
    const recent = await getMostRecentExamination(institutionA, adminAuth);
    expect(recent?.id).toBe(examinationId);
  });

  it("getInstitutionPassRateTrend() reports 50% for a 1-pass/1-fail examination", async () => {
    const trend = await getInstitutionPassRateTrend(institutionA, adminAuth, 5);
    const point = trend.find((p) => p.examinationId === examinationId);
    expect(point?.percentage).toBe(50);
  });

  it("getInstitutionStats() counts classes/divisions/students/teachers/staff", async () => {
    const stats = await getInstitutionStats(institutionA, adminAuth);
    expect(stats.classes).toBeGreaterThanOrEqual(1);
    expect(stats.divisions).toBeGreaterThanOrEqual(1);
    expect(stats.students).toBeGreaterThanOrEqual(2); // studentPass + studentFail created above
    expect(stats.teachers).toBeGreaterThanOrEqual(2); // teacher1 + teacher2 hold the 'teacher' role
    expect(stats.staff).toBeGreaterThanOrEqual(2); // the 2 createStaffMember() calls
  });

  it("getTodayAttendanceSummary() runs without error and returns zeroed counts when nothing's marked", async () => {
    const summary = await getTodayAttendanceSummary(institutionA, adminAuth, "2099-01-05");
    expect(summary.studentsMarked).toBe(0);
    expect(summary.staffMarked).toBe(0);
    expect(summary.studentsEnrolled).toBeGreaterThanOrEqual(2);
  });

  it("getUpcomingItems() merges upcoming calendar events and upcoming examinations, sorted by date", async () => {
    await createCalendarEvent(institutionA, adminAuth, adminUserId, { title: "Founders Day", eventType: "other", startDate: "2099-02-01" });
    const items = await getUpcomingItems(institutionA, adminAuth, 10);
    expect(items.some((i) => i.title === "Founders Day" && i.kind === "calendar")).toBe(true);
    const dates = items.map((i) => i.date);
    expect([...dates].sort()).toEqual(dates); // already sorted ascending
  });
});
