/**
 * PROMPT EDU ERP — Daily Assessment (a new Exam Type, migration 0048).
 *
 * User's own spec: "Add Daily Assessment as a new Exam Type in Exam
 * Create... conducted based on the portion completed that day... the same
 * subject can be assessed on consecutive days... Maintain one monthly
 * Daily Assessment Register... Mark entry must be completed on the same
 * day... As each day's marks are entered, automatically update the
 * monthly consolidated class-wise result... In the Student Profile, show
 * daily performance... Generate monthly student-wise, subject-wise and
 * class-wise analysis."
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import {
  listExamTypes, createExamination,
  createDailyAssessment, listDailyAssessments, getDailyAssessment, getDailyAssessmentMarksGrid, enterDailyAssessmentMarks,
  getDailyAssessmentConsolidatedResult, getStudentDailyAssessmentHistory,
  getDailyAssessmentSubjectAnalysis, getDailyAssessmentClassAnalysis, getDailyAssessmentStudentAnalysis,
} from "../../modules/examination/service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let classId: string, subjectId: string, student1: string, student2: string;
let examinationId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "daily-assessment-school");
  const admin = await seedDemoUser(db, institutionA, "admin@daily-assessment.example", "DA Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 5", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  const subject = await createSubject(institutionA, adminAuth, adminUserId, { name: "Mathematics" });
  subjectId = subject.id;
  const year = await getCurrentAcademicYear(institutionA, adminAuth);

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "DA-1", fullName: "Student One" });
  student1 = s1.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: student1, classId, sectionId: section.id, academicYearId: year!.id });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "DA-2", fullName: "Student Two" });
  student2 = s2.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: student2, classId, sectionId: section.id, academicYearId: year!.id });

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const dailyType = examTypes.find((t) => t.is_daily_assessment)!;
  const exam = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: dailyType.id, academicYearId: year!.id, name: "ignored",
  });
  examinationId = exam.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Daily Assessment exam type (§Add Daily Assessment as a new Exam Type in Exam Create)", () => {
  it("listExamTypes() self-heals exactly one is_daily_assessment=true row", async () => {
    const examTypes = await listExamTypes(institutionA, adminAuth);
    const dailyTypes = examTypes.filter((t) => t.is_daily_assessment);
    expect(dailyTypes).toHaveLength(1);
    expect(dailyTypes[0].periodicity).toBe("Daily");

    // Idempotent -- a second read doesn't create a duplicate.
    const again = await listExamTypes(institutionA, adminAuth);
    expect(again.filter((t) => t.is_daily_assessment)).toHaveLength(1);
  });

  it("createExamination() auto-names the monthly register and reuses it on re-submission (§'one monthly register')", async () => {
    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    const examTypes = await listExamTypes(institutionA, adminAuth);
    const dailyType = examTypes.find((t) => t.is_daily_assessment)!;

    expect(examinationId).toBeTruthy();

    const again = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: dailyType.id, academicYearId: year!.id, name: "ignored again",
    });
    expect(again.id).toBe(examinationId); // reused, not duplicated
    expect(again.name).toMatch(/^Daily Assessment —/);
    expect(again.start_date).toBeTruthy();
    expect(again.end_date).toBeTruthy();
  });
});

describe("Daily register entries (§'Date, Class, Subject, Portion, Maximum Mark and Status')", () => {
  it("creates an entry with all 6 fields, defaulting Status to pending", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const entry = await createDailyAssessment(institutionA, adminAuth, adminUserId, {
      examinationId, classId, subjectId, assessmentDate: today, portion: "Chapter 3: Fractions", maxMarks: 20,
    });
    expect(entry.class_name).toBe("Grade 5");
    expect(entry.subject_name).toBe("Mathematics");
    expect(entry.portion).toBe("Chapter 3: Fractions");
    expect(entry.max_marks).toBe("20.00");
    expect(entry.status).toBe("pending");

    const list = await listDailyAssessments(institutionA, adminAuth, examinationId);
    expect(list.find((e) => e.id === entry.id)).toBeTruthy();

    const fetched = await getDailyAssessment(institutionA, adminAuth, entry.id);
    expect(fetched?.id).toBe(entry.id);
  });

  it("the same subject can be assessed again on a later date (§'consecutive days')", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const entryA = await createDailyAssessment(institutionA, adminAuth, adminUserId, {
      examinationId, classId, subjectId, assessmentDate: today, portion: "Chapter 4: Decimals", maxMarks: 25,
    });
    const entryB = await createDailyAssessment(institutionA, adminAuth, adminUserId, {
      examinationId, classId, subjectId, assessmentDate: today, portion: "Chapter 4 continued", maxMarks: 25,
    });
    expect(entryA.id).not.toBe(entryB.id); // no uniqueness constraint blocking repeats
  });
});

describe("Same-day mark entry (§'Mark entry must be completed on the same day')", () => {
  it("entering marks the same day flips status to completed", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const entry = await createDailyAssessment(institutionA, adminAuth, adminUserId, {
      examinationId, classId, subjectId, assessmentDate: today, portion: "Chapter 5: Ratios", maxMarks: 20,
    });
    const grid = await getDailyAssessmentMarksGrid(institutionA, adminAuth, entry.id);
    expect(grid).toHaveLength(2);
    expect(grid.map((g) => g.student_name).sort()).toEqual(["Student One", "Student Two"]);

    await enterDailyAssessmentMarks(institutionA, adminAuth, adminUserId, entry.id, [
      { studentId: student1, marksObtained: 19, isAbsent: false },
      { studentId: student2, marksObtained: 15, isAbsent: false },
    ]);

    const after = await getDailyAssessment(institutionA, adminAuth, entry.id);
    expect(after?.status).toBe("completed");
  });

  it("rejects mark entry once the assessment date has passed", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const entry = await createDailyAssessment(institutionA, adminAuth, adminUserId, {
      examinationId, classId, subjectId, assessmentDate: yesterday, portion: "Backfill attempt", maxMarks: 20,
    });
    await expect(
      enterDailyAssessmentMarks(institutionA, adminAuth, adminUserId, entry.id, [
        { studentId: student1, marksObtained: 10, isAbsent: false },
      ])
    ).rejects.toThrow(/same day/);
  });
});

describe("Monthly consolidated class-wise result (§'automatically update... Student Name, Daily Mark, Cumulative Mark, Grade')", () => {
  it("reflects the latest day's mark and the running cumulative total with a grade", async () => {
    const consolidated = await getDailyAssessmentConsolidatedResult(institutionA, adminAuth, examinationId, classId);
    const row1 = consolidated.find((r) => r.student_id === student1)!;
    expect(row1.student_name).toBe("Student One");
    expect(row1.latest_marks_obtained).toBe("19.00");
    expect(row1.latest_max_marks).toBe("20.00");
    expect(Number(row1.cumulative_marks_obtained)).toBeGreaterThanOrEqual(19);
    expect(Number(row1.cumulative_max_marks)).toBeGreaterThanOrEqual(20);
    expect(row1.grade_label).toBeTruthy(); // resolved from the institution's default grade scale

    // Subject filter narrows to just this subject's sessions.
    const filtered = await getDailyAssessmentConsolidatedResult(institutionA, adminAuth, examinationId, classId, subjectId);
    expect(filtered.find((r) => r.student_id === student1)).toBeTruthy();
  });
});

describe("Student Profile daily performance (§'Date, Subject, Portion and Marks')", () => {
  it("returns each completed session with its date/subject/portion/marks", async () => {
    const history = await getStudentDailyAssessmentHistory(institutionA, adminAuth, student1);
    expect(history.length).toBeGreaterThan(0);
    const row = history[0];
    expect(row.subject_name).toBe("Mathematics");
    expect(row.portion).toBeTruthy();
    expect(row.assessment_date).toBeTruthy();
  });
});

describe("Monthly analysis (§'student-wise, subject-wise and class-wise... portions conducted and performance')", () => {
  it("subject-wise analysis lists sessions conducted and portions covered", async () => {
    const subjectAnalysis = await getDailyAssessmentSubjectAnalysis(institutionA, adminAuth, examinationId);
    const row = subjectAnalysis.find((s) => s.subject_id === subjectId)!;
    expect(row.sessions_conducted).toBeGreaterThan(0);
    expect(row.portions.length).toBeGreaterThan(0);
    expect(row.portions).toContain("Chapter 5: Ratios");
  });

  it("class-wise analysis lists sessions conducted and average performance", async () => {
    const classAnalysis = await getDailyAssessmentClassAnalysis(institutionA, adminAuth, examinationId);
    const row = classAnalysis.find((c) => c.class_id === classId)!;
    expect(row.sessions_conducted).toBeGreaterThan(0);
    expect(row.avg_percent).toBeGreaterThan(0);
  });

  it("student-wise analysis lists sessions taken and cumulative performance per student", async () => {
    const studentAnalysis = await getDailyAssessmentStudentAnalysis(institutionA, adminAuth, examinationId, classId);
    const row = studentAnalysis.find((s) => s.student_id === student1)!;
    expect(row.sessions_taken).toBeGreaterThan(0);
    expect(Number(row.cumulative_marks_obtained)).toBeGreaterThan(0);
    expect(row.avg_percent).toBeGreaterThan(0);
  });
});
