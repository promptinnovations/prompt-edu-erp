/**
 * PROMPT EDU ERP — sidebar redesign follow-up features: the new service
 * functions built to back sub-items that had no page before this pass
 * (Academic years CRUD UI, Monthly attendance/staff registers, Mark entry
 * status tracker, and the Result section's shared marks-matrix query used
 * by both Consolidated Marks and Report Cards). Mirrors the setup patterns
 * of examination-flow.test.ts / attendance-flow.test.ts / staff-flow.test.ts
 * rather than re-deriving them, and adds tenant isolation checks for each
 * new query.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import {
  createClass, createSection, createSubject, getCurrentAcademicYear,
  listAcademicYears, createAcademicYear,
} from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import { listAttendanceStatuses, markAttendance, getMonthlyAttendanceRegister } from "../../modules/attendance/service";
import { createStaffMember, markStaffAttendance, getMonthlyStaffAttendanceRegister } from "../../modules/staff/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject, enterMarks,
  getMarkEntryStatus, getExaminationMarksMatrix,
} from "../../modules/examination/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let classId: string, sectionId: string, subjectId: string, subject2Id: string;
let student1: string, student2: string;
let presentStatusId: string;
let staffId: string;
let examinationId: string, examSubjectId: string, examSubject2Id: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "redesign-school-a");
  institutionB = await seedDemoInstitution(db, "redesign-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@redesign-a.example", "Redesign Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const teacher = await seedDemoUser(db, institutionA, "teacher@redesign-a.example", "Redesign Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 7", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;
  const subject = await createSubject(institutionA, adminAuth, adminUserId, { name: "English" });
  subjectId = subject.id;
  const subject2 = await createSubject(institutionA, adminAuth, adminUserId, { name: "Science" });
  subject2Id = subject2.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RD-1", fullName: "Redesign Student One" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RD-2", fullName: "Redesign Student Two" });
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

  const staff = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "staffmember@redesign-a.example", fullName: "Redesign Staff", staffCode: "RD-S1",
    employmentStatus: "active", roleCode: "teacher",
  });
  staffId = staff.id;

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main");
  if (!examType) throw new Error("expected seeded exam type academic_main");

  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year.id, name: "Term 1 Redesign Exam",
  });
  examinationId = examination.id;
  await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);
  const examSubject = await addExamSubject(institutionA, adminAuth, adminUserId, {
    examinationId, subjectId, maxMarks: 100, passMarks: 35,
  });
  examSubjectId = examSubject.id;
  const examSubject2 = await addExamSubject(institutionA, adminAuth, adminUserId, {
    examinationId, subjectId: subject2Id, maxMarks: 100, passMarks: 35,
  });
  examSubject2Id = examSubject2.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Monthly attendance register (Attendance sidebar group)", () => {
  it("getMonthlyAttendanceRegister() returns every enrolled student, with entries only for marked days", async () => {
    await markAttendance(institutionA, teacherAuth, teacherUserId, {
      classId, sectionId, date: "2026-09-02",
      entries: [{ studentId: student1, statusId: presentStatusId, isLate: false }],
    });
    await markAttendance(institutionA, teacherAuth, teacherUserId, {
      classId, sectionId, date: "2026-09-15",
      entries: [
        { studentId: student1, statusId: presentStatusId, isLate: false },
        { studentId: student2, statusId: presentStatusId, isLate: false },
      ],
    });

    const register = await getMonthlyAttendanceRegister(institutionA, adminAuth, classId, sectionId, 2026, 9);
    expect(register.students.map((s) => s.student_id).sort()).toEqual([student1, student2].sort());
    expect(register.entries).toHaveLength(3); // student1 x2 days + student2 x1 day
    expect(register.entries.every((e) => e.status_code === "present")).toBe(true);
    expect(register.entries.filter((e) => e.student_id === student1)).toHaveLength(2);
  });

  it("a different month returns no entries even though the students are still enrolled", async () => {
    const register = await getMonthlyAttendanceRegister(institutionA, adminAuth, classId, sectionId, 2026, 10);
    expect(register.students).toHaveLength(2);
    expect(register.entries).toHaveLength(0);
  });

  it("Institution B cannot read Institution A's monthly register via ID enumeration", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@redesign-b.example", "Redesign B Admin");
    const register = await getMonthlyAttendanceRegister(institutionB, adminB.authUserId, classId, sectionId, 2026, 9);
    expect(register.students).toHaveLength(0);
    expect(register.entries).toHaveLength(0);
  });
});

describe("Monthly staff register (Staff sidebar group)", () => {
  it("getMonthlyStaffAttendanceRegister() lists every active staff member even with no records that month", async () => {
    const registerBeforeMarking = await getMonthlyStaffAttendanceRegister(institutionA, adminAuth, 2026, 9);
    expect(registerBeforeMarking.staff.some((s) => s.staff_id === staffId)).toBe(true);
    expect(registerBeforeMarking.entries).toHaveLength(0);

    await markStaffAttendance(institutionA, adminAuth, adminUserId, {
      date: "2026-09-05", entries: [{ staffId, statusId: presentStatusId }],
    });

    const register = await getMonthlyStaffAttendanceRegister(institutionA, adminAuth, 2026, 9);
    expect(register.entries).toHaveLength(1);
    expect(register.entries[0]).toMatchObject({ staff_id: staffId, date: "2026-09-05", status_code: "present" });
  });

  it("Institution B's register never includes Institution A's staff", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin2@redesign-b.example", "Redesign B Admin 2");
    const register = await getMonthlyStaffAttendanceRegister(institutionB, adminB.authUserId, 2026, 9);
    expect(register.staff.some((s) => s.staff_id === staffId)).toBe(false);
  });
});

describe("Mark entry status tracker (Examination sidebar group)", () => {
  it("getMarkEntryStatus() reports expected vs entered per exam subject before any marks are entered", async () => {
    const status = await getMarkEntryStatus(institutionA, adminAuth, examinationId);
    expect(status).toHaveLength(2);
    for (const row of status) {
      expect(row.expected).toBe(2); // both students enrolled in the exam's class/section
      expect(row.entered).toBe(0);
    }
  });

  it("entering marks for one subject/one student updates only that subject's entered count", async () => {
    await enterMarks(institutionA, teacherAuth, teacherUserId, examSubjectId, [
      { studentId: student1, marksObtained: 78, isAbsent: false },
    ]);

    const status = await getMarkEntryStatus(institutionA, adminAuth, examinationId);
    const englishRow = status.find((r) => r.exam_subject_id === examSubjectId)!;
    const scienceRow = status.find((r) => r.exam_subject_id === examSubject2Id)!;
    expect(englishRow.entered).toBe(1);
    expect(englishRow.expected).toBe(2);
    expect(scienceRow.entered).toBe(0);
  });
});

describe("Examination marks matrix (Result section: Consolidated Marks + Report Cards share this query)", () => {
  it("getExaminationMarksMatrix() returns one flat row per enrolled student x exam subject", async () => {
    const matrix = await getExaminationMarksMatrix(institutionA, adminAuth, examinationId);
    // 2 students x 2 exam subjects = 4 rows, regardless of whether marks exist yet.
    expect(matrix).toHaveLength(4);

    const student1English = matrix.find((r) => r.student_id === student1 && r.exam_subject_id === examSubjectId)!;
    expect(Number(student1English.marks_obtained)).toBe(78);
    expect(student1English.is_absent).toBe(false);

    const student2Science = matrix.find((r) => r.student_id === student2 && r.exam_subject_id === examSubject2Id)!;
    expect(student2Science.marks_obtained).toBeNull(); // never entered

    // A single student's rows (what the per-student Report Card page filters to) covers every subject.
    const student1Rows = matrix.filter((r) => r.student_id === student1);
    expect(student1Rows.map((r) => r.subject_name).sort()).toEqual(["English", "Science"]);
  });

  it("Institution B sees no rows for Institution A's examination", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin3@redesign-b.example", "Redesign B Admin 3");
    const matrix = await getExaminationMarksMatrix(institutionB, adminB.authUserId, examinationId);
    expect(matrix).toHaveLength(0);
  });
});

// Runs last deliberately — flipping is_current here would otherwise pull
// the rug out from under every enrollment-dependent query above (registers,
// mark entry status, marks matrix all join through `academic_years
// ay.is_current = true`).
describe("Academic years CRUD (Academic Structure sidebar group)", () => {
  it("createAcademicYear() adds a year and, when isCurrent, demotes the previously-current one", async () => {
    const before = await listAcademicYears(institutionA, adminAuth);
    const currentBefore = before.find((y) => y.is_current);
    expect(currentBefore).toBeTruthy();

    const created = await createAcademicYear(institutionA, adminAuth, adminUserId, {
      name: "2027-2028", startDate: "2027-06-01", endDate: "2028-03-31", isCurrent: true,
    });
    expect(created.is_current).toBe(true);

    const after = await listAcademicYears(institutionA, adminAuth);
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((y) => y.is_current)).toHaveLength(1);
    expect(after.find((y) => y.id === currentBefore!.id)?.is_current).toBe(false);
    expect(after.find((y) => y.id === created.id)?.is_current).toBe(true);
  });
});
