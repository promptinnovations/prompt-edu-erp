/**
 * PROMPT EDU ERP — Student Portfolio Dashboard follow-up ("the student and
 * parent portal should be like this [rich dashboard reference] — do
 * everything needed for that"). Covers the two genuinely new pieces of
 * server logic this redesign needed:
 *   1. getStudentAcademicPerformanceByTerm() — the "Academic Performance"
 *      table's Subject x Term1/Term2/.../Final pivot (modules/examination/
 *      service.ts), including the nested-withInstitutionContext fix (grade
 *      band lookups must run as sibling top-level calls, not nested inside
 *      this function's own scoped block — see that function's own comment).
 *   2. portfolio_summaries CRUD (modules/portfolio-summary/service.ts) —
 *      the dedicated "Teacher's Overall Remark / Strengths / Areas for
 *      Improvement / Future Goals" record, per explicit answer to
 *      AskUserQuestion ("New dedicated portfolio-summary record").
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject, enterMarks,
  createGradeScale, createGradeBand, getStudentAcademicPerformanceByTerm,
} from "../../modules/examination/service";
import {
  getPortfolioSummary, upsertPortfolioSummary,
} from "../../modules/portfolio-summary/service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let academicYearId: string;
let term1Id: string, term2Id: string;
let studentId: string;
let subjectMathId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "portfolio-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@portfolio-a.example", "Portfolio Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");
  academicYearId = year.id;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 7", sortOrder: 1 });
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId: cls.id, name: "A" });
  const subject = await createSubject(institutionA, adminAuth, adminUserId, { name: "Mathematics" });
  subjectMathId = subject.id;

  const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PF-1", fullName: "Portfolio Student" });
  studentId = student.id;

  await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    await scoped.query(
      `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
      [institutionA, studentId, academicYearId, cls.id, section.id]
    );
    const t1 = await scoped.query<{ id: string }>(
      `insert into terms (institution_id, academic_year_id, name, start_date, end_date) values ($1, $2, 'Term 1', '2026-06-01', '2026-09-30') returning id`,
      [institutionA, academicYearId]
    );
    term1Id = t1.rows[0].id;
    const t2 = await scoped.query<{ id: string }>(
      `insert into terms (institution_id, academic_year_id, name, start_date, end_date) values ($1, $2, 'Term 2', '2026-10-01', '2027-01-31') returning id`,
      [institutionA, academicYearId]
    );
    term2Id = t2.rows[0].id;
  });

  // Default grade scale: A (>=80), B (>=60, <80), C (>=0, <60).
  const scale = await createGradeScale(institutionA, adminAuth, adminUserId, { name: "Standard", isDefault: true });
  await createGradeBand(institutionA, adminAuth, adminUserId, { gradeScaleId: scale.id, minPercent: 80, maxPercent: 100, gradeLabel: "A" });
  await createGradeBand(institutionA, adminAuth, adminUserId, { gradeScaleId: scale.id, minPercent: 60, maxPercent: 79.99, gradeLabel: "B" });
  await createGradeBand(institutionA, adminAuth, adminUserId, { gradeScaleId: scale.id, minPercent: 0, maxPercent: 59.99, gradeLabel: "C" });

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main");
  if (!examType) throw new Error("expected seeded exam type academic_main");

  // Term 1 exam: 80/100 -> 80% -> grade A.
  const exam1 = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId, termId: term1Id, name: "Term 1 Exam",
  });
  await addExamClass(institutionA, adminAuth, exam1.id, cls.id, section.id);
  const es1 = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId: exam1.id, subjectId: subjectMathId, maxMarks: 100, passMarks: 35 });
  await enterMarks(institutionA, adminAuth, adminUserId, es1.id, [{ studentId, marksObtained: 80, isAbsent: false }]);

  // Term 2 exam: 60/100 -> 60% -> grade B.
  const exam2 = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId, termId: term2Id, name: "Term 2 Exam",
  });
  await addExamClass(institutionA, adminAuth, exam2.id, cls.id, section.id);
  const es2 = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId: exam2.id, subjectId: subjectMathId, maxMarks: 100, passMarks: 35 });
  await enterMarks(institutionA, adminAuth, adminUserId, es2.id, [{ studentId, marksObtained: 60, isAbsent: false }]);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("getStudentAcademicPerformanceByTerm", () => {
  it("pivots marks that are still entry_status='draft' (live-from-entry, no approve/lock gate)", async () => {
    const result = await getStudentAcademicPerformanceByTerm(institutionA, adminAuth, studentId, academicYearId);
    expect(result.columns).toHaveLength(2);
    expect(result.columns.map((c) => c.label)).toEqual(["Term 1", "Term 2"]);

    const row = result.rows.find((r) => r.subjectId === subjectMathId);
    expect(row).toBeTruthy();
    expect(row!.cells[term1Id]?.percent).toBe(80);
    expect(row!.cells[term1Id]?.gradeLabel).toBe("A");
    expect(row!.cells[term2Id]?.percent).toBe(60);
    expect(row!.cells[term2Id]?.gradeLabel).toBe("B");
  });

  it("'Final' averages the available term percentages and resolves a grade from them", async () => {
    const result = await getStudentAcademicPerformanceByTerm(institutionA, adminAuth, studentId, academicYearId);
    const row = result.rows.find((r) => r.subjectId === subjectMathId);
    // (80 + 60) / 2 = 70 -> grade B (band is 60-79.99).
    expect(row!.cells.final?.percent).toBe(70);
    expect(row!.cells.final?.gradeLabel).toBe("B");
  });

  it("returns empty columns/rows for an academic year with no terms", async () => {
    const db = await getDbClient();
    const otherYear = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const { rows } = await scoped.query<{ id: string }>(
        `insert into academic_years (institution_id, name, start_date, end_date) values ($1, '2099-2100', '2099-06-01', '2100-03-31') returning id`,
        [institutionA]
      );
      return rows[0].id;
    });
    const result = await getStudentAcademicPerformanceByTerm(institutionA, adminAuth, studentId, otherYear);
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });
});

describe("portfolio_summaries (Teacher's Overall Remark / Strengths / Areas for Improvement / Future Goals)", () => {
  it("returns null when nothing has been set yet", async () => {
    const summary = await getPortfolioSummary(institutionA, adminAuth, studentId, academicYearId);
    expect(summary).toBeNull();
  });

  it("upserts a summary and reads it back", async () => {
    const saved = await upsertPortfolioSummary(institutionA, adminAuth, adminUserId, {
      studentId, academicYearId,
      overallRemark: "Bright and hardworking student.",
      strengths: ["Good academic performance", "Active participation"],
      areasForImprovement: ["Can improve in Mathematics"],
      futureGoals: ["Develop leadership skills"],
    });
    expect(saved.overall_remark).toBe("Bright and hardworking student.");
    expect(saved.strengths).toEqual(["Good academic performance", "Active participation"]);

    const fetched = await getPortfolioSummary(institutionA, adminAuth, studentId, academicYearId);
    expect(fetched?.overall_remark).toBe("Bright and hardworking student.");
    expect(fetched?.areas_for_improvement).toEqual(["Can improve in Mathematics"]);
  });

  it("a second upsert for the same student+year replaces the row rather than creating a duplicate", async () => {
    await upsertPortfolioSummary(institutionA, adminAuth, adminUserId, {
      studentId, academicYearId, overallRemark: "Updated remark.", strengths: [], areasForImprovement: [], futureGoals: [],
    });
    const fetched = await getPortfolioSummary(institutionA, adminAuth, studentId, academicYearId);
    expect(fetched?.overall_remark).toBe("Updated remark.");

    const db = await getDbClient();
    const count = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const { rows } = await scoped.query<{ count: string }>(
        "select count(*) from portfolio_summaries where student_id = $1 and academic_year_id = $2",
        [studentId, academicYearId]
      );
      return Number(rows[0].count);
    });
    expect(count).toBe(1);
  });
});
