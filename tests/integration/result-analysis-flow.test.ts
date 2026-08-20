/**
 * PROMPT EDU ERP — Result Analysis (§Page-6 follow-up): "Result Analysis
 * (of selected exam) — School-wide, Section wise, Grade wise, Class wise,
 * Subject wise, Teacher wise" plus the Consolidated Marks class filter and
 * the exam-covered-classes lookup that powers its dropdown. Subject-wise
 * itself is unchanged (already covered by analytics-flow.test.ts's
 * getSubjectComparison() coverage) — this file covers everything new:
 * getResultSchoolSummary, getResultsBySection, getResultsByClass,
 * getResultsByGrade, getResultsByTeacher, the classId filter on
 * getExaminationMarksMatrix, and listClassesForExamination.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import { createStaffMember, createTeacherAssignment } from "../../modules/staff/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, computeResults,
  getExaminationMarksMatrix, listClassesForExamination,
} from "../../modules/examination/service";
import { refreshAnalyticsViews, getResultSchoolSummary, getResultsBySection, getResultsByClass, getResultsByGrade, getResultsByTeacher } from "../../modules/analytics/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let gradeClassId: string, sectionAId: string, sectionBId: string;
let otherClassId: string; // exists, but NOT covered by the examination — powers the class-filter "excludes" case
let mathId: string, englishId: string;
let student1: string, student2: string, student3: string, student4: string; // 1,2 in section A; 3,4 in section B
let examinationId: string;
let mathTeacherUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "ra-school-a");
  institutionB = await seedDemoInstitution(db, "ra-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@ra-a.example", "RA Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "RA Grade 5", sortOrder: 1 });
  gradeClassId = cls.id;
  const secA = await createSection(institutionA, adminAuth, adminUserId, { classId: gradeClassId, name: "A" });
  sectionAId = secA.id;
  const secB = await createSection(institutionA, adminAuth, adminUserId, { classId: gradeClassId, name: "B" });
  sectionBId = secB.id;

  const other = await createClass(institutionA, adminAuth, adminUserId, { name: "RA Grade 6", sortOrder: 2 });
  otherClassId = other.id;

  const math = await createSubject(institutionA, adminAuth, adminUserId, { name: "RA Mathematics" });
  mathId = math.id;
  const english = await createSubject(institutionA, adminAuth, adminUserId, { name: "RA English" });
  englishId = english.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RA-1", fullName: "RA Student One" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RA-2", fullName: "RA Student Two" });
  const s3 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RA-3", fullName: "RA Student Three" });
  const s4 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RA-4", fullName: "RA Student Four" });
  student1 = s1.id; student2 = s2.id; student3 = s3.id; student4 = s4.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const dbForEnroll = await getDbClient();
  await dbForEnroll.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    for (const [sid, secId] of [[student1, sectionAId], [student2, sectionAId], [student3, sectionBId], [student4, sectionBId]] as const) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
         values ($1, $2, $3, $4, $5)`,
        [institutionA, sid, year.id, gradeClassId, secId]
      );
    }
  });

  // A math teacher, assigned via Staff > Teacher Assignments for the whole
  // class (section_id null) — English deliberately gets NO assignment, to
  // exercise "teacher wise" correctly omitting a subject nobody is mapped to.
  const mathTeacher = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "ra-teacher@ra-a.example", fullName: "RA Math Teacher", staffCode: "RA-T1",
    employmentStatus: "active", roleCode: "teacher",
  });
  mathTeacherUserId = mathTeacher.user_id;
  {
    const authId = crypto.randomUUID();
    await db.query("update users set auth_user_id = $1 where id = $2", [authId, mathTeacherUserId]);
  }
  await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
    userId: mathTeacherUserId, classId: gradeClassId, academicYearId: year.id, roleType: "subject_teacher", subjectId: mathId,
  });

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main")!;
  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year.id, name: "RA Term Exam",
  });
  examinationId = examination.id;
  await addExamClass(institutionA, adminAuth, examinationId, gradeClassId, null); // whole class, both sections

  const mathSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: mathId, maxMarks: 100, passMarks: 35 });
  const englishSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: englishId, maxMarks: 100, passMarks: 35 });

  // student1: 95/90 (A+ band, section A), student2: 55/50 (C+, section A)
  // student3: 75/70 (B+, section B), student4: 20/25 (F, section B)
  for (const es of [mathSubject, englishSubject]) {
    const marks = es.id === mathSubject.id
      ? [
          { studentId: student1, marksObtained: 95, isAbsent: false }, { studentId: student2, marksObtained: 55, isAbsent: false },
          { studentId: student3, marksObtained: 75, isAbsent: false }, { studentId: student4, marksObtained: 20, isAbsent: false },
        ]
      : [
          { studentId: student1, marksObtained: 90, isAbsent: false }, { studentId: student2, marksObtained: 50, isAbsent: false },
          { studentId: student3, marksObtained: 70, isAbsent: false }, { studentId: student4, marksObtained: 25, isAbsent: false },
        ];
    await enterMarks(institutionA, adminAuth, adminUserId, es.id, marks);
    await submitMarks(institutionA, adminAuth, es.id, adminUserId);
    await verifyMarks(institutionA, adminAuth, es.id, adminUserId);
    await approveMarks(institutionA, adminAuth, es.id, adminUserId);
  }
  await computeResults(institutionA, adminAuth, examinationId);
  await refreshAnalyticsViews();
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Result Analysis — School-wide (§Page-6 follow-up)", () => {
  it("getResultSchoolSummary() averages every computed result and buckets them into the institution's grade bands", async () => {
    const summary = await getResultSchoolSummary(institutionA, adminAuth, examinationId);
    expect(summary.total_students).toBe(4);
    // percentages: student1 92.5, student2 52.5, student3 72.5, student4 22.5 -> avg 60
    expect(summary.average_percent).toBeCloseTo(60, 1);

    const nonZero = summary.grade_distribution.filter((g) => g.student_count > 0);
    expect(nonZero.map((g) => g.grade_label).sort()).toEqual(["A+", "B+", "C+", "F"].sort());
    expect(summary.grade_distribution.reduce((sum, g) => sum + g.student_count, 0)).toBe(4);
  });
});

describe("Result Analysis — Section wise / Class wise (§Page-6 follow-up)", () => {
  it("getResultsBySection() attributes each student to their exam-time section, ranked by average % descending", async () => {
    const bySection = await getResultsBySection(institutionA, adminAuth, examinationId);
    expect(bySection).toHaveLength(2);

    const sectionA = bySection.find((r) => r.id === sectionAId)!;
    const sectionB = bySection.find((r) => r.id === sectionBId)!;
    expect(sectionA.parent_name).toBe("RA Grade 5");
    expect(sectionA.student_count).toBe(2);
    expect(sectionA.average_percent).toBeCloseTo((92.5 + 52.5) / 2, 1); // 72.5
    expect(sectionB.student_count).toBe(2);
    expect(sectionB.average_percent).toBeCloseTo((72.5 + 22.5) / 2, 1); // 47.5

    // Section A (72.5%) outranks Section B (47.5%) — ranked highest average first.
    expect(bySection[0].id).toBe(sectionAId);
    expect(bySection[1].id).toBe(sectionBId);

    expect(sectionA.grade_counts["A+"]).toBe(1);
    expect(sectionA.grade_counts["C+"]).toBe(1);
    expect(sectionB.grade_counts["B+"]).toBe(1);
    expect(sectionB.grade_counts["F"]).toBe(1);
  });

  it("getResultsByClass() rolls every section of a class into one row", async () => {
    const byClass = await getResultsByClass(institutionA, adminAuth, examinationId);
    expect(byClass).toHaveLength(1);
    expect(byClass[0].id).toBe(gradeClassId);
    expect(byClass[0].student_count).toBe(4);
    expect(byClass[0].average_percent).toBeCloseTo(60, 1);
    expect(Object.values(byClass[0].grade_counts).reduce((a, b) => a + b, 0)).toBe(4);
  });
});

describe("Result Analysis — Grade wise, 'Top 5 each grade' (§Page-6 follow-up)", () => {
  it("getResultsByGrade() groups by letter grade band and lists each band's top students by percentage", async () => {
    const byGrade = await getResultsByGrade(institutionA, adminAuth, examinationId);
    const aPlus = byGrade.find((g) => g.grade_label === "A+")!;
    const fBand = byGrade.find((g) => g.grade_label === "F")!;

    expect(aPlus.student_count).toBe(1);
    expect(aPlus.top_students).toHaveLength(1);
    expect(aPlus.top_students[0].student_id).toBe(student1);
    expect(aPlus.top_students[0].percentage).toBeCloseTo(92.5, 1);

    expect(fBand.student_count).toBe(1);
    expect(fBand.top_students[0].student_id).toBe(student4);

    // Ordered highest band first (min_percent descending).
    const labels = byGrade.map((g) => g.grade_label);
    expect(labels.indexOf("A+")).toBeLessThan(labels.indexOf("B+"));
    expect(labels.indexOf("B+")).toBeLessThan(labels.indexOf("C+"));
    expect(labels.indexOf("C+")).toBeLessThan(labels.indexOf("F"));
  });
});

describe("Result Analysis — Teacher wise, via existing Teacher Assignments (§Page-6 follow-up)", () => {
  it("getResultsByTeacher() attributes Math to its assigned teacher and omits English entirely (no assignment exists)", async () => {
    const byTeacher = await getResultsByTeacher(institutionA, adminAuth, examinationId);
    expect(byTeacher).toHaveLength(1);
    expect(byTeacher[0].teacher_user_id).toBe(mathTeacherUserId);
    expect(byTeacher[0].subject_id).toBe(mathId);
    expect(byTeacher[0].marked_count).toBe(4);
    expect(Number(byTeacher[0].average_marks)).toBeCloseTo((95 + 55 + 75 + 20) / 4, 1);
    expect(byTeacher.some((t) => t.subject_id === englishId)).toBe(false);
  });

  it("returns an empty list (not an error) for an examination id that does not exist", async () => {
    const rows = await getResultsByTeacher(institutionA, adminAuth, crypto.randomUUID());
    expect(rows).toHaveLength(0);
  });
});

describe("Consolidated Marks class filter + exam-covered-classes lookup (§Page-6 follow-up 'select exam, class from dropdown')", () => {
  it("listClassesForExamination() returns only the classes this exam actually covers", async () => {
    const classes = await listClassesForExamination(institutionA, adminAuth, examinationId);
    expect(classes).toHaveLength(1);
    expect(classes[0].id).toBe(gradeClassId);
    expect(classes.some((c) => c.id === otherClassId)).toBe(false);
  });

  it("getExaminationMarksMatrix() with no classId returns every covered student; filtered to the exam's own class returns the same set; filtered to an unrelated class returns nothing", async () => {
    const unfiltered = await getExaminationMarksMatrix(institutionA, adminAuth, examinationId);
    const studentIds = new Set(unfiltered.map((r) => r.student_id));
    expect(studentIds.size).toBe(4);

    const filteredToOwnClass = await getExaminationMarksMatrix(institutionA, adminAuth, examinationId, gradeClassId);
    expect(new Set(filteredToOwnClass.map((r) => r.student_id))).toEqual(studentIds);

    const filteredToOtherClass = await getExaminationMarksMatrix(institutionA, adminAuth, examinationId, otherClassId);
    expect(filteredToOtherClass).toHaveLength(0);
  });
});

describe("Result Analysis tenant isolation (§Page-6 follow-up)", () => {
  it("Institution B sees nothing for Institution A's examination across every new function", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@ra-b.example", "RA B Admin", "institution_admin");

    const summaryB = await getResultSchoolSummary(institutionB, adminB.authUserId, examinationId);
    expect(summaryB.total_students).toBe(0);

    expect(await getResultsBySection(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
    expect(await getResultsByClass(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
    expect(await getResultsByGrade(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
    expect(await getResultsByTeacher(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
    expect(await listClassesForExamination(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
    expect(await getExaminationMarksMatrix(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
  });
});
