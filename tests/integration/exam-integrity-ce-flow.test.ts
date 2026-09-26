/**
 * PROMPT EDU ERP — EXAMINATION_SPEC result integrity + Continuous
 * Evaluation (migration 0055). Covers spec §14 items 1 (basic subject
 * total), 2 (one subject absent excluded), 3 (all absent, no div-by-zero),
 * 6 (grade-band boundary), 8 (CE total mode), 9 (CE components mode with a
 * CE component absent), 17 (roster academic-year filter), plus §1.2 blank
 * cells, §8 overall-pass reconciliation with the pass-rate trend, and §1.6
 * the finalize/freeze snapshot. Regular examinations only — Daily
 * Assessment is covered (unchanged) by daily-assessment-flow.test.ts.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear, createAcademicYear } from "../../modules/academic/service";
import { createStudent, deleteStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, updateExamination, addExamClass, addExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, computeResults, getResults,
  getMarksGrid, getMarkEntryStatus, getExaminationMarksMatrix, getInstitutionPassRateTrend,
  setCeComponents, enterCeMarks, finalizeExamination, listGradeScales, getGradeBands, updateGradeBand,
  resolveGradeBand, computeStudentResult, DEFAULT_OVERALL_PASS_PCT, lookupGrade,
} from "../../modules/examination/service";

let inst: string;
let adminAuth: string, adminUserId: string;
let classId: string, sectionId: string;
let mathId: string, scienceId: string;
let s1: string, s2: string, s3: string, sOld: string, sWithdrawn: string;
let yearId: string, oldYearId: string;
let examTypeId: string;

async function rawResult(examinationId: string, studentId: string) {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
    const { rows } = await scoped.query<{
      total_marks: string; max_total_marks: string; percentage: string; grade_label: string | null; is_pass: boolean | null;
      failed_subject_count: number; absent_subject_count: number; pass_threshold_pct: string | null; is_frozen: boolean;
      is_provisional: boolean;
    }>(
      "select * from results where examination_id = $1 and student_id = $2", [examinationId, studentId]
    );
    return rows[0] ?? null;
  });
}

async function newExam(name: string, subjects: Array<[string, number, number]>, extra: { overallPassPct?: number | null } = {}) {
  const exam = await createExamination(inst, adminAuth, adminUserId, { examTypeId, academicYearId: yearId, name, ...extra });
  await addExamClass(inst, adminAuth, exam.id, classId, sectionId);
  const es: string[] = [];
  for (const [subjectId, maxMarks, passMarks] of subjects) {
    const row = await addExamSubject(inst, adminAuth, adminUserId, { examinationId: exam.id, subjectId, maxMarks, passMarks });
    es.push(row.id);
  }
  return { examinationId: exam.id, es };
}

async function approveAll(examSubjectIds: string[]) {
  for (const id of examSubjectIds) {
    await submitMarks(inst, adminAuth, id, adminUserId);
    await verifyMarks(inst, adminAuth, id, adminUserId);
    await approveMarks(inst, adminAuth, id, adminUserId);
  }
}

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "integrity-a");
  const admin = await seedDemoUser(db, inst, "admin@integrity-a.example", "Integrity Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  classId = (await createClass(inst, adminAuth, adminUserId, { name: "IN Grade 8", sortOrder: 1 })).id;
  sectionId = (await createSection(inst, adminAuth, adminUserId, { classId, name: "A" })).id;
  mathId = (await createSubject(inst, adminAuth, adminUserId, { name: "IN Maths" })).id;
  scienceId = (await createSubject(inst, adminAuth, adminUserId, { name: "IN Science" })).id;

  s1 = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "IN-1", fullName: "IN One" })).id;
  s2 = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "IN-2", fullName: "IN Two" })).id;
  s3 = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "IN-3", fullName: "IN Three" })).id;
  sOld = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "IN-OLD", fullName: "IN Last Year Only" })).id;
  sWithdrawn = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "IN-W", fullName: "IN Withdrawn" })).id;

  const year = await getCurrentAcademicYear(inst, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");
  yearId = year.id;
  const old = await createAcademicYear(inst, adminAuth, adminUserId, { name: "IN-Prev", startDate: "2020-06-01", endDate: "2021-03-31", isCurrent: false });
  oldYearId = old.id;

  await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
    for (const sid of [s1, s2, s3, sWithdrawn]) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
        [inst, sid, yearId, classId, sectionId]
      );
    }
    // Promoted-away student: last year's enrollment in this class is still
    // an 'active' history row (promotion keeps it) — must NOT appear in a
    // current-year exam's roster.
    await scoped.query(
      `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
      [inst, sOld, oldYearId, classId, sectionId]
    );
  });
  await deleteStudent(inst, adminAuth, adminUserId, sWithdrawn);

  const types = await listExamTypes(inst, adminAuth);
  examTypeId = types.find((t) => t.code === "academic_main")!.id;
});

afterAll(() => { __resetDbClientForTests(); });

describe("§14.1/2/3 subject totals and absence", () => {
  let exam: { examinationId: string; es: string[] };
  beforeAll(async () => {
    exam = await newExam("IN Basic", [[mathId, 100, 35], [scienceId, 100, 35]]);
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [
      { studentId: s1, marksObtained: 70, isAbsent: false },
      { studentId: s2, marksObtained: null, isAbsent: true },
      { studentId: s3, marksObtained: null, isAbsent: true },
    ]);
    await enterMarks(inst, adminAuth, adminUserId, exam.es[1], [
      { studentId: s1, marksObtained: 80, isAbsent: false },
      { studentId: s2, marksObtained: 80, isAbsent: false },
      { studentId: s3, marksObtained: null, isAbsent: true },
    ]);
    await computeResults(inst, adminAuth, exam.examinationId);
  });

  it("item 1: basic subject total — 150/200 = 75%", async () => {
    const r = await rawResult(exam.examinationId, s1);
    expect(Number(r!.total_marks)).toBe(150);
    expect(Number(r!.max_total_marks)).toBe(200);
    expect(Number(r!.percentage)).toBe(75);
    expect(r!.grade_label).toBe("B+");
    expect(r!.is_pass).toBe(true);
    expect(r!.failed_subject_count).toBe(0);
  });

  it("item 2: one subject absent is excluded from total AND denominator (80/100, not 80/200)", async () => {
    const r = await rawResult(exam.examinationId, s2);
    expect(Number(r!.total_marks)).toBe(80);
    expect(Number(r!.max_total_marks)).toBe(100);
    expect(Number(r!.percentage)).toBe(80);
    expect(r!.absent_subject_count).toBe(1);
    expect(r!.failed_subject_count).toBe(0);
    expect(r!.grade_label).toBe("A");
    expect(r!.is_pass).toBe(true);
  });

  it("item 3: absent in every subject — 0%, no NaN/div-by-zero, no grade, not a pass", async () => {
    const r = await rawResult(exam.examinationId, s3);
    expect(r).not.toBeNull();
    expect(Number(r!.max_total_marks)).toBe(0);
    expect(Number(r!.percentage)).toBe(0);
    expect(Number.isNaN(Number(r!.percentage))).toBe(false);
    expect(r!.grade_label).toBeNull();
    expect(r!.is_pass).toBe(false);
    expect(r!.absent_subject_count).toBe(2);
  });
});

describe("§1.2 blank cells never become rows", () => {
  it("a blank Present cell writes nothing; blanking a saved draft clears it", async () => {
    const exam = await newExam("IN Blank", [[mathId, 100, 35]]);
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [
      { studentId: s1, marksObtained: null, isAbsent: false },
      { studentId: s2, marksObtained: 55, isAbsent: false },
    ]);
    let grid = await getMarksGrid(inst, adminAuth, exam.es[0]);
    expect(grid.find((g) => g.student_id === s1)!.mark_id).toBeNull();
    let status = await getMarkEntryStatus(inst, adminAuth, exam.examinationId);
    expect(status[0].entered).toBe(1);

    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [{ studentId: s2, marksObtained: null, isAbsent: false }]);
    grid = await getMarksGrid(inst, adminAuth, exam.es[0]);
    expect(grid.find((g) => g.student_id === s2)!.mark_id).toBeNull();
    status = await getMarkEntryStatus(inst, adminAuth, exam.examinationId);
    expect(status[0].entered).toBe(0);
  });
});

describe("§14.17 roster filters by the exam's academic year and excludes withdrawn students", () => {
  it("current-year exam roster excludes last-year-only and withdrawn students", async () => {
    const exam = await newExam("IN Roster", [[mathId, 100, 35]]);
    const ids = (await getMarksGrid(inst, adminAuth, exam.es[0])).map((g) => g.student_id).sort();
    expect(ids).toEqual([s1, s2, s3].sort());
    const status = await getMarkEntryStatus(inst, adminAuth, exam.examinationId);
    expect(status[0].expected).toBe(3);
    const matrixIds = new Set((await getExaminationMarksMatrix(inst, adminAuth, exam.examinationId)).map((r) => r.student_id));
    expect(matrixIds.has(sOld)).toBe(false);
    expect(matrixIds.has(sWithdrawn)).toBe(false);
  });

  it("a previous-year exam's roster is that year's students only", async () => {
    const exam = await createExamination(inst, adminAuth, adminUserId, { examTypeId, academicYearId: oldYearId, name: "IN Old Year" });
    await addExamClass(inst, adminAuth, exam.id, classId, sectionId);
    const es = await addExamSubject(inst, adminAuth, adminUserId, { examinationId: exam.id, subjectId: mathId, maxMarks: 100, passMarks: 35 });
    const ids = (await getMarksGrid(inst, adminAuth, es.id)).map((g) => g.student_id);
    expect(ids).toEqual([sOld]);
  });
});

describe("§14.6 / §8 grade-band boundary", () => {
  it("resolveGradeBand closes the [80,89.99]/[90,100] gap that the inclusive lookup leaves", async () => {
    const bands = [
      { min_percent: "90", max_percent: "100", grade_label: "A+" },
      { min_percent: "80", max_percent: "89.99", grade_label: "A" },
    ];
    expect(resolveGradeBand(bands, 89.995)?.grade_label).toBe("A+"); // rounds to the stored 90.00
    expect(resolveGradeBand(bands, 89.994)?.grade_label).toBe("A");
    expect(resolveGradeBand(bands, 89.991)?.grade_label).toBe("A");
    expect(resolveGradeBand(bands, 79)).toBeNull();
    // The original lookupGrade() (still used, unchanged, by Daily
    // Assessment) keeps its inclusive behaviour — the gap is only closed
    // for regular exams.
    const scales = await listGradeScales(inst, adminAuth);
    const scaleId = scales.find((s) => s.is_default)!.id;
    const db = await getDbClient();
    const legacy = await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, (scoped) => lookupGrade(scoped, scaleId, 89.995));
    expect(legacy).toBeNull();
  });

  it("a stored 89.995% result gets a grade that agrees with its 2dp percentage", async () => {
    const exam = await newExam("IN Boundary", [[mathId, 1000, 350]]);
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [
      { studentId: s1, marksObtained: 899.95, isAbsent: false },
      { studentId: s2, marksObtained: 899.9, isAbsent: false },
    ]);
    await computeResults(inst, adminAuth, exam.examinationId);
    const r1 = await rawResult(exam.examinationId, s1);
    expect(Number(r1!.percentage)).toBe(90);
    expect(r1!.grade_label).toBe("A+");
    const r2 = await rawResult(exam.examinationId, s2);
    expect(Number(r2!.percentage)).toBe(89.99);
    expect(r2!.grade_label).toBe("A");
  });
});

describe("§8 overall pass reconciliation", () => {
  it("passing every subject but overall % below the exam threshold is an overall FAIL — and the trend agrees", async () => {
    const exam = await newExam("IN Threshold", [[mathId, 100, 35], [scienceId, 100, 35]], { overallPassPct: 60 });
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [
      { studentId: s1, marksObtained: 40, isAbsent: false },
      { studentId: s2, marksObtained: 70, isAbsent: false },
    ]);
    await enterMarks(inst, adminAuth, adminUserId, exam.es[1], [
      { studentId: s1, marksObtained: 45, isAbsent: false },
      { studentId: s2, marksObtained: 70, isAbsent: false },
    ]);
    await approveAll(exam.es);
    const r1 = await rawResult(exam.examinationId, s1);
    expect(r1!.failed_subject_count).toBe(0);
    expect(Number(r1!.percentage)).toBe(42.5);
    expect(Number(r1!.pass_threshold_pct)).toBe(60);
    expect(r1!.is_pass).toBe(false);
    expect((await rawResult(exam.examinationId, s2))!.is_pass).toBe(true);

    // The Home pass-rate trend used to re-derive "passed every subject" and
    // would have reported 100% here; it now reads the stored verdict.
    const trend = await getInstitutionPassRateTrend(inst, adminAuth, 50);
    expect(trend.find((p) => p.examinationId === exam.examinationId)!.percentage).toBe(50);

    const results = await getResults(inst, adminAuth, exam.examinationId);
    expect(results.find((r) => r.student_id === s1)!.is_pass).toBe(false);

    // Clearing the per-exam threshold falls back to the platform default.
    await updateExamination(inst, adminAuth, adminUserId, exam.examinationId, { overallPassPct: null });
    const after = await rawResult(exam.examinationId, s1);
    expect(Number(after!.pass_threshold_pct)).toBe(DEFAULT_OVERALL_PASS_PCT);
    expect(after!.is_pass).toBe(false); // 42.5 < 50
  });

  it("computeStudentResult is pure and applies the same rule", () => {
    const r = computeStudentResult({
      subjects: [
        { id: "a", passMarks: 35, mainMaxMarks: 100, units: [{ key: "a", maxMarks: 100 }] },
        { id: "b", passMarks: 35, mainMaxMarks: 100, units: [{ key: "b", maxMarks: 100 }] },
      ],
      entries: new Map([
        ["a", { key: "a", marksObtained: 40, isAbsent: false, entryStatus: "approved" }],
        ["b", { key: "b", marksObtained: 45, isAbsent: false, entryStatus: "approved" }],
      ]),
      subjectPassPct: 35, overallPassPct: 60,
    });
    expect(r).toMatchObject({ failedSubjectCount: 0, percentage: 42.5, isPass: false, isProvisional: false });
  });
});

describe("§CE Continuous Evaluation", () => {
  it("item 8: TOTAL mode — one CE mark counts toward the subject like any other unit", async () => {
    const exam = await newExam("IN CE Total", [[mathId, 80, 28]]);
    await updateExamination(inst, adminAuth, adminUserId, exam.examinationId, { ceEnabled: true, ceMode: "total" });
    const comps = await setCeComponents(inst, adminAuth, adminUserId, exam.es[0], [{ name: "anything", maxMarks: 20 }]);
    expect(comps).toHaveLength(1);
    expect(comps[0].name).toBe("CE");
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [{ studentId: s1, marksObtained: 60, isAbsent: false }]);
    await enterCeMarks(inst, adminAuth, adminUserId, exam.es[0], [{ studentId: s1, componentId: comps[0].id, marksObtained: 15, isAbsent: false }]);
    await computeResults(inst, adminAuth, exam.examinationId);
    const r = await rawResult(exam.examinationId, s1);
    expect(Number(r!.total_marks)).toBe(75);
    expect(Number(r!.max_total_marks)).toBe(100);
    expect(Number(r!.percentage)).toBe(75);
    // Report card / consolidated matrix carries the CE breakdown.
    const cell = (await getExaminationMarksMatrix(inst, adminAuth, exam.examinationId)).find((m) => m.student_id === s1)!;
    expect(cell.ce_components).toHaveLength(1);
    expect(Number(cell.ce_components[0].marks_obtained)).toBe(15);
    // CE marks outside the component's range are refused.
    await expect(enterCeMarks(inst, adminAuth, adminUserId, exam.es[0], [{ studentId: s2, componentId: comps[0].id, marksObtained: 21, isAbsent: false }]))
      .rejects.toThrow(/between 0 and 20/);
  });

  it("item 9: COMPONENTS mode — an absent CE component drops out of numerator and denominator", async () => {
    const exam = await newExam("IN CE Components", [[mathId, 80, 28]]);
    await updateExamination(inst, adminAuth, adminUserId, exam.examinationId, { ceEnabled: true, ceMode: "components" });
    const comps = await setCeComponents(inst, adminAuth, adminUserId, exam.es[0], [
      { name: "Project", maxMarks: 10 }, { name: "Assignment", maxMarks: 10 },
    ]);
    const project = comps.find((c) => c.name === "Project")!;
    const assignment = comps.find((c) => c.name === "Assignment")!;
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [{ studentId: s1, marksObtained: 60, isAbsent: false }]);
    await enterCeMarks(inst, adminAuth, adminUserId, exam.es[0], [
      { studentId: s1, componentId: project.id, marksObtained: null, isAbsent: true },
      { studentId: s1, componentId: assignment.id, marksObtained: 8, isAbsent: false },
    ]);
    await computeResults(inst, adminAuth, exam.examinationId);
    const r = await rawResult(exam.examinationId, s1);
    expect(Number(r!.total_marks)).toBe(68);
    expect(Number(r!.max_total_marks)).toBe(90);
    expect(Number(r!.percentage)).toBe(75.56);
    expect(r!.absent_subject_count).toBe(0); // the subject was sat; only one CE part was missed
    // The same submit/verify/approve workflow moves CE marks too.
    await approveAll(exam.es);
    expect((await rawResult(exam.examinationId, s1))!.is_provisional).toBe(false);
    // A component with CE marks can't silently be dropped.
    await expect(setCeComponents(inst, adminAuth, adminUserId, exam.es[0], [{ name: "Project", maxMarks: 10 }]))
      .rejects.toThrow(/already been entered/);
  });
});

describe("§1.6 finalize = immutable snapshot", () => {
  it("after finalizing, band edits / re-entered marks never change stored results", async () => {
    const exam = await newExam("IN Freeze", [[mathId, 100, 35]]);
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [
      { studentId: s1, marksObtained: 85, isAbsent: false },
      { studentId: s2, marksObtained: 72, isAbsent: false },
      { studentId: s3, marksObtained: 30, isAbsent: false },
    ]);
    // Provisional (not yet approved) results can't be finalized.
    await expect(finalizeExamination(inst, adminAuth, adminUserId, exam.examinationId)).rejects.toThrow(/provisional/);
    await approveAll(exam.es);
    const before = await rawResult(exam.examinationId, s1);
    expect(before!.grade_label).toBe("A");

    const { frozen } = await finalizeExamination(inst, adminAuth, adminUserId, exam.examinationId);
    expect(frozen).toBe(3);
    expect((await rawResult(exam.examinationId, s1))!.is_frozen).toBe(true);

    // 1) Grade band relabelled + boundaries moved.
    const scaleId = (await listGradeScales(inst, adminAuth)).find((s) => s.is_default)!.id;
    const bandA = (await getGradeBands(inst, adminAuth, scaleId)).find((b) => b.grade_label === "A")!;
    await updateGradeBand(inst, adminAuth, adminUserId, bandA.id, { gradeLabel: "A-renamed" });
    // 2) A mark changed underneath (bypassing the service guard) + recompute.
    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
      await scoped.query("update marks set marks_obtained = 10 where exam_subject_id = $1 and student_id = $2", [exam.es[0], s1]);
      await scoped.query("update examinations set overall_pass_pct = 99 where id = $1", [exam.examinationId]);
    });
    await computeResults(inst, adminAuth, exam.examinationId);

    const after = await rawResult(exam.examinationId, s1);
    expect(Number(after!.total_marks)).toBe(Number(before!.total_marks));
    expect(Number(after!.percentage)).toBe(Number(before!.percentage));
    expect(after!.is_pass).toBe(before!.is_pass);
    expect(after!.grade_label).toBe("A");
    const shown = (await getResults(inst, adminAuth, exam.examinationId)).find((r) => r.student_id === s1)!;
    expect(shown.grade_label).toBe("A"); // snapshot label, not the renamed band

    // Ordinary mark entry is refused on a finalized exam.
    await expect(enterMarks(inst, adminAuth, adminUserId, exam.es[0], [{ studentId: s2, marksObtained: 1, isAbsent: false }]))
      .rejects.toThrow(/finalized/);
    await expect(finalizeExamination(inst, adminAuth, adminUserId, exam.examinationId)).rejects.toThrow(/already finalized/);

    await updateGradeBand(inst, adminAuth, adminUserId, bandA.id, { gradeLabel: "A" });
  });

  it("live (non-finalized) exams still recompute on every change", async () => {
    const exam = await newExam("IN Live", [[mathId, 100, 35]]);
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [{ studentId: s1, marksObtained: 50, isAbsent: false }]);
    await computeResults(inst, adminAuth, exam.examinationId);
    expect(Number((await rawResult(exam.examinationId, s1))!.percentage)).toBe(50);
    await enterMarks(inst, adminAuth, adminUserId, exam.es[0], [{ studentId: s1, marksObtained: 65, isAbsent: false }]);
    await computeResults(inst, adminAuth, exam.examinationId);
    expect(Number((await rawResult(exam.examinationId, s1))!.percentage)).toBe(65);
  });
});
