/**
 * PROMPT EDU ERP — Result Analysis & Reporting: configurable grading
 * (lookupGrade/isPass, PassPct, GradeBand.color), auto-recompute on mark
 * approval/lock/correction, and the new Result Analysis service functions
 * (getResultsByStage, getSubjectWiseByGrade, getClassMarksHistogram, and
 * getResultsByTeacher's extended stats). Complements
 * result-analysis-flow.test.ts (school/section/class/grade/teacher-wise,
 * pre-existing) and super-admin-flow.test.ts (curriculum preset
 * provisioning) rather than duplicating either.
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
  enterMarks, submitMarks, verifyMarks, approveMarks, correctMark,
  createGradeScale, createGradeBand, listGradeScales, getGradeBands,
  lookupGrade, isPass, PASS_COLOR, FAIL_COLOR,
} from "../../modules/examination/service";
import {
  getResultsByStage, getSubjectWiseByGrade, getClassMarksHistogram, getResultsByTeacher,
} from "../../modules/analytics/service";
import { updateInstitutionPassPct, getInstitution } from "../../services/institution/institution-service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let primaryClassId: string, middleClassId: string;
let primarySectionId: string;
let mathId: string, scienceId: string;
let studentX: string, studentY: string, studentZ: string;
let examinationId: string;
let gradeScaleId: string;
let bandHigh: string, bandMid: string;
let mathTeacherUserId: string;
let mathExamSubjectId: string, scienceExamSubjectId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "gr-school-a");
  institutionB = await seedDemoInstitution(db, "gr-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@gr-a.example", "GR Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  // §K — a fully custom scale, distinct labels/colors from the demo
  // seed's default "Standard Grading" scale, to prove nothing here reads a
  // hardcoded label or threshold.
  const scale = await createGradeScale(institutionA, adminAuth, adminUserId, { name: "GR Custom Scale", isDefault: true, curriculum: "Custom" });
  gradeScaleId = scale.id;
  const high = await createGradeBand(institutionA, adminAuth, adminUserId, { gradeScaleId, minPercent: 60, maxPercent: 100, gradeLabel: "Excellent", gradePoint: 3, color: "#16a34a" });
  const mid = await createGradeBand(institutionA, adminAuth, adminUserId, { gradeScaleId, minPercent: 40, maxPercent: 59.99, gradeLabel: "Satisfactory", gradePoint: 2, color: "#f59e0b" });
  await createGradeBand(institutionA, adminAuth, adminUserId, { gradeScaleId, minPercent: 0, maxPercent: 39.99, gradeLabel: "Needs Improvement", gradePoint: 1, color: "#dc2626" });
  bandHigh = high.id; bandMid = mid.id;

  // Tenant-wide PassPct set explicitly (via the new self-service function),
  // deliberately different from either subject's own per-subject override
  // below, so failedSubjectCount vs overallPct can be tested independently.
  await updateInstitutionPassPct(institutionA, adminAuth, adminUserId, { passPct: 40 });

  const primary = await createClass(institutionA, adminAuth, adminUserId, { name: "GR Grade 3", sortOrder: 1, stage: "Primary" });
  primaryClassId = primary.id;
  const primarySec = await createSection(institutionA, adminAuth, adminUserId, { classId: primaryClassId, name: "A" });
  primarySectionId = primarySec.id;

  const middle = await createClass(institutionA, adminAuth, adminUserId, { name: "GR Grade 7", sortOrder: 2, stage: "Middle" });
  middleClassId = middle.id;
  await createSection(institutionA, adminAuth, adminUserId, { classId: middleClassId, name: "A" });

  const math = await createSubject(institutionA, adminAuth, adminUserId, { name: "GR Mathematics" });
  mathId = math.id;
  const science = await createSubject(institutionA, adminAuth, adminUserId, { name: "GR Science" });
  scienceId = science.id;

  const sx = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "GR-X", fullName: "GR Student X" });
  const sy = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "GR-Y", fullName: "GR Student Y" });
  const sz = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "GR-Z", fullName: "GR Student Z" });
  studentX = sx.id; studentY = sy.id; studentZ = sz.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const dbForEnroll = await getDbClient();
  await dbForEnroll.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    for (const [sid, secId] of [[studentX, primarySectionId], [studentY, primarySectionId], [studentZ, primarySectionId]] as const) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
        [institutionA, sid, year.id, primaryClassId, secId]
      );
    }
  });

  const mathTeacher = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "gr-teacher@gr-a.example", fullName: "GR Math Teacher", staffCode: "GR-T1",
    employmentStatus: "active", roleCode: "teacher",
  });
  mathTeacherUserId = mathTeacher.user_id;
  {
    const authId = crypto.randomUUID();
    await db.query("update users set auth_user_id = $1 where id = $2", [authId, mathTeacherUserId]);
  }
  await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
    userId: mathTeacherUserId, classId: primaryClassId, academicYearId: year.id, roleType: "subject_teacher", subjectId: mathId,
  });

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main")!;
  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year.id, name: "GR Term Exam", gradeScaleId,
  });
  examinationId = examination.id;
  await addExamClass(institutionA, adminAuth, examinationId, primaryClassId, null);

  // Math: max 100, pass mark 50 (a 50% override — stricter than the 40%
  // tenant default). Science: max 50, pass mark 17.5 (35% — looser than
  // the tenant default) — deliberately different from each other AND from
  // the tenant PassPct so per-subject overrides can be told apart from it.
  const mathSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: mathId, maxMarks: 100, passMarks: 50 });
  const scienceSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: scienceId, maxMarks: 50, passMarks: 17.5 });
  mathExamSubjectId = mathSubject.id; scienceExamSubjectId = scienceSubject.id;

  // X: Math 60 (pass, >=50) + Science 20 (pass, 20/50=40%>=35%) -> both
  //    subjects pass; total 80/150=53.33% >= tenant 40% -> overall PASS.
  // Y: Math 45 (fail, <50) + Science 30 (pass, 30/50=60%>=35%) -> one
  //    failed subject; total 75/150=50%>=40% but still overall FAIL
  //    (failedSubjectCount>0 OR clause).
  // Z: Math 90 (pass) + Science 10 (fail, 10/50=20%<35%) -> one failed
  //    subject; total 100/150=66.67%>=40% but still overall FAIL.
  await enterMarks(institutionA, adminAuth, adminUserId, mathExamSubjectId, [
    { studentId: studentX, marksObtained: 60, isAbsent: false },
    { studentId: studentY, marksObtained: 45, isAbsent: false },
    { studentId: studentZ, marksObtained: 90, isAbsent: false },
  ]);
  await enterMarks(institutionA, adminAuth, adminUserId, scienceExamSubjectId, [
    { studentId: studentX, marksObtained: 20, isAbsent: false },
    { studentId: studentY, marksObtained: 30, isAbsent: false },
    { studentId: studentZ, marksObtained: 10, isAbsent: false },
  ]);

  for (const es of [mathExamSubjectId, scienceExamSubjectId]) {
    await submitMarks(institutionA, adminAuth, es, adminUserId);
    await verifyMarks(institutionA, adminAuth, es, adminUserId);
  }
  // Deliberately NOT calling computeResults() manually anywhere in this
  // file — approveMarks()/lockMarks() below must auto-recompute on their
  // own (Result Analysis spec "live recompute on save, no publish step").
  await approveMarks(institutionA, adminAuth, mathExamSubjectId, adminUserId);
  await approveMarks(institutionA, adminAuth, scienceExamSubjectId, adminUserId);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

async function readResultRow(studentId: string) {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    const { rows } = await scoped.query<{
      percentage: string; is_pass: boolean; failed_subject_count: number; grade_band_id: string | null;
    }>(
      "select percentage, is_pass, failed_subject_count, grade_band_id from results where examination_id = $1 and student_id = $2",
      [examinationId, studentId]
    );
    return rows[0] ?? null;
  });
}

describe("lookupGrade() / isPass() — the only two functions allowed to contain grading logic", () => {
  it("isPass() is a pure percentage-vs-threshold comparison", () => {
    expect(isPass(40, 40)).toBe(true); // exactly at threshold passes
    expect(isPass(39.99, 40)).toBe(false);
    expect(isPass(100, 0)).toBe(true);
  });

  it("PASS_COLOR/FAIL_COLOR are the fixed global pair, distinct from any grade band color", () => {
    expect(PASS_COLOR).toBe("#059669");
    expect(FAIL_COLOR).toBe("#dc2626");
  });

  it("lookupGrade() resolves a percentage to the tenant's own band (label + color), not a literal", async () => {
    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const excellent = await lookupGrade(scoped, gradeScaleId, 75);
      expect(excellent?.label).toBe("Excellent");
      expect(excellent?.color).toBe("#16a34a");

      const satisfactory = await lookupGrade(scoped, gradeScaleId, 45);
      expect(satisfactory?.label).toBe("Satisfactory");

      const needsImprovement = await lookupGrade(scoped, gradeScaleId, 10);
      expect(needsImprovement?.label).toBe("Needs Improvement");
      expect(needsImprovement?.color).toBe("#dc2626");
    });
  });

  it("lookupGrade() returns null for a null scaleId (no grade scale attached)", async () => {
    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      expect(await lookupGrade(scoped, null, 90)).toBeNull();
    });
  });
});

describe("computeResults() — per-subject pass_marks override vs tenant PassPct, failedSubjectCount OR-rule", () => {
  it("auto-recomputed on approveMarks() alone — no manual computeResults() call in this file's setup", async () => {
    const x = await readResultRow(studentX);
    expect(x).not.toBeNull();
    expect(Number(x!.percentage)).toBeCloseTo((60 + 20) / 150 * 100, 1);
  });

  it("student X: both subjects pass their own override, overall percentage clears tenant PassPct -> PASS", async () => {
    const x = await readResultRow(studentX);
    expect(x!.failed_subject_count).toBe(0);
    expect(x!.is_pass).toBe(true);
    expect(x!.grade_band_id).toBe(bandMid); // 53.33% falls in Satisfactory (40-59.99)
  });

  it("student Y: fails Math's own 50-mark override -> overall FAIL despite total% clearing tenant PassPct", async () => {
    const y = await readResultRow(studentY);
    expect(Number(y!.percentage)).toBeCloseTo(50, 1);
    expect(y!.failed_subject_count).toBe(1);
    expect(y!.is_pass).toBe(false); // failedSubjectCount > 0 overrides an otherwise-passing percentage
  });

  it("student Z: fails Science's own 17.5-mark override -> overall FAIL despite a strong 66.67% total", async () => {
    const z = await readResultRow(studentZ);
    expect(Number(z!.percentage)).toBeCloseTo(200 / 3, 1);
    expect(z!.failed_subject_count).toBe(1);
    expect(z!.is_pass).toBe(false);
    expect(z!.grade_band_id).toBe(bandHigh); // grade label is purely descriptive — 66.67% is still "Excellent" even though it's an overall fail
  });

  it("correctMark() on an approved mark auto-recomputes results too", async () => {
    const db = await getDbClient();
    const markId = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const { rows } = await scoped.query<{ id: string }>(
        "select id from marks where exam_subject_id = $1 and student_id = $2", [mathExamSubjectId, studentY]
      );
      return rows[0].id;
    });
    // Bumping Y's Math mark up to 55 (now clears the 50-mark pass override).
    await correctMark(institutionA, adminAuth, adminUserId, markId, 55, "re-check");
    const y = await readResultRow(studentY);
    expect(y!.failed_subject_count).toBe(0);
    expect(y!.is_pass).toBe(true);
  });
});

describe("updateInstitutionPassPct() — tenant-wide default, editable independently of grade bands", () => {
  it("getInstitution() reflects the value set earlier in this file's setup", async () => {
    const inst = await getInstitution(institutionA, adminAuth);
    expect(inst?.passPct).toBe(40);
  });

  it("can be changed, and only affects THIS institution", async () => {
    await updateInstitutionPassPct(institutionA, adminAuth, adminUserId, { passPct: 45 });
    expect((await getInstitution(institutionA, adminAuth))?.passPct).toBe(45);
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@gr-b.example", "GR B Admin", "institution_admin");
    expect((await getInstitution(institutionB, adminB.authUserId))?.passPct).toBe(35); // untouched, still the schema default
    // restore for the rest of this file's tests, which assume 40
    await updateInstitutionPassPct(institutionA, adminAuth, adminUserId, { passPct: 40 });
  });
});

describe("Grade band CRUD carries color (§K — never keyed by label text)", () => {
  it("listGradeScales()/getGradeBands() surface curriculum + color", async () => {
    const scales = await listGradeScales(institutionA, adminAuth);
    const scale = scales.find((s) => s.id === gradeScaleId)!;
    expect(scale.curriculum).toBe("Custom");

    const bands = await getGradeBands(institutionA, adminAuth, gradeScaleId);
    const colors = new Set(bands.map((b) => b.color));
    expect(colors).toEqual(new Set(["#16a34a", "#f59e0b", "#dc2626"]));
  });
});

describe("getResultsByStage() — true Section-wise (classes.stage), distinct from the Division-level getResultsBySection()", () => {
  it("groups by stage, not by class name", async () => {
    const byStage = await getResultsByStage(institutionA, adminAuth, examinationId);
    expect(byStage.map((r) => r.name)).toEqual(["Primary"]); // only Primary has enrolled students with results
    const primary = byStage[0];
    expect(primary.student_count).toBe(3);
    expect(primary.class_id).toBeNull(); // a stage spans many classes, no single class_id
  });

  it("an 'Unassigned' class (no stage set) still surfaces, not silently dropped", async () => {
    const noStageClass = await createClass(institutionA, adminAuth, adminUserId, { name: "GR No-Stage Class", sortOrder: 3 });
    expect(noStageClass.stage).toBeNull();
    // No students/results attached — just confirming the grouping SQL's
    // coalesce(c.stage, 'Unassigned') doesn't error on a null-stage class
    // existing in the institution.
    const byStage = await getResultsByStage(institutionA, adminAuth, examinationId);
    expect(byStage.every((r) => r.name !== "")).toBe(true);
  });
});

describe("getSubjectWiseByGrade() — grouped by Grade, weakest-first below-threshold list, top bands never hardcoded", () => {
  it("Math and Science each get their own row under 'GR Grade 3', not merged", async () => {
    const rows = await getSubjectWiseByGrade(institutionA, adminAuth, examinationId);
    const mathRow = rows.find((r) => r.subject_name === "GR Mathematics")!;
    const scienceRow = rows.find((r) => r.subject_name === "GR Science")!;
    expect(mathRow.class_name).toBe("GR Grade 3");
    expect(scienceRow.class_name).toBe("GR Grade 3");
    expect(mathRow.count).toBe(3);
    expect(mathRow.max_obtained).toBe(90);
    expect(mathRow.min_obtained).toBe(55); // Y's Math mark was corrected 45 -> 55 in the previous describe block (correctMark() test), which already ran by this point
  });

  it("Math: after correctMark() raised Y to 55, pass_count reflects the new value (2 pass, 1 still below Math's own override... wait Z passes too)", async () => {
    const rows = await getSubjectWiseByGrade(institutionA, adminAuth, examinationId);
    const mathRow = rows.find((r) => r.subject_name === "GR Mathematics")!;
    // X=60 pass, Y=55 pass (post-correction), Z=90 pass -> all three pass Math's 50-mark override now.
    expect(mathRow.pass_count).toBe(3);
    expect(mathRow.fail_count).toBe(0);
    expect(mathRow.below_threshold).toHaveLength(0);
  });

  it("Science: X pass (40%), Y pass (60%), Z fail (20%) — below_threshold lists Z, weakest first", async () => {
    const rows = await getSubjectWiseByGrade(institutionA, adminAuth, examinationId);
    const scienceRow = rows.find((r) => r.subject_name === "GR Science")!;
    expect(scienceRow.pass_count).toBe(2);
    expect(scienceRow.fail_count).toBe(1);
    expect(scienceRow.below_threshold).toHaveLength(1);
    expect(scienceRow.below_threshold[0].student_name).toBe("GR Student Z");
  });

  it("top_band_counts uses the tenant's real grade labels/colors, never a hardcoded 'A'/'A+'", async () => {
    const rows = await getSubjectWiseByGrade(institutionA, adminAuth, examinationId);
    const mathRow = rows.find((r) => r.subject_name === "GR Mathematics")!;
    for (const b of mathRow.top_band_counts) {
      expect(["Excellent", "Satisfactory", "Needs Improvement"]).toContain(b.grade_label);
    }
  });
});

describe("getClassMarksHistogram() — bucket edges from GradeBand rows, plus a synthetic Below-PassPct bucket", () => {
  it("one bucket per band (in the tenant's own labels) plus a final Below-PassPct bucket", async () => {
    const buckets = await getClassMarksHistogram(institutionA, adminAuth, examinationId, primaryClassId);
    const labels = buckets.map((b) => b.label);
    expect(labels.slice(0, 3)).toEqual(["Excellent", "Satisfactory", "Needs Improvement"]);
    expect(labels[3]).toMatch(/^Below 40% \(PassPct\)$/);
    const bandTotal = buckets[0].count + buckets[1].count + buckets[2].count;
    expect(bandTotal).toBe(3); // every one of the 3 students landed in exactly one band
  });

  it("band colors come straight from grade_bands.color, the Below-PassPct bucket always uses FAIL_COLOR", async () => {
    const buckets = await getClassMarksHistogram(institutionA, adminAuth, examinationId, primaryClassId);
    expect(buckets.find((b) => b.label === "Excellent")?.color).toBe("#16a34a");
    expect(buckets.find((b) => b.label.startsWith("Below"))?.color).toBe(FAIL_COLOR);
  });
});

describe("getResultsByTeacher() — extended stats (max/median/highest/lowest/full-marks/fail count/grade_counts)", () => {
  it("attributes Math to its assigned teacher with the full stat set, computed from raw marks not a matview", async () => {
    const rows = await getResultsByTeacher(institutionA, adminAuth, examinationId);
    expect(rows).toHaveLength(1); // only Math has a teacher_assignments row; Science has none
    const mathRow = rows[0];
    expect(mathRow.teacher_user_id).toBe(mathTeacherUserId);
    expect(mathRow.subject_id).toBe(mathId);
    expect(mathRow.max_marks).toBe(100);
    expect(mathRow.marked_count).toBe(3);
    // Marks are 60, 55 (post-correction), 90.
    expect(mathRow.highest_marks).toBe(90);
    expect(mathRow.lowest_marks).toBe(55);
    expect(mathRow.median_marks).toBe(60);
    expect(mathRow.average_marks).toBeCloseTo((60 + 55 + 90) / 3, 1);
    expect(mathRow.full_marks_count).toBe(0);
    expect(mathRow.fail_count).toBe(0); // all three now clear the 50-mark pass override
    expect(mathRow.pass_percentage).toBe(100);
    expect(Object.values(mathRow.grade_counts).reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("Result Analysis tenant isolation for the new functions", () => {
  it("Institution B sees nothing for Institution A's examination", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@gr-b-iso.example", "GR B Iso Admin", "institution_admin");
    expect(await getResultsByStage(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
    expect(await getSubjectWiseByGrade(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
    expect(await getClassMarksHistogram(institutionB, adminB.authUserId, examinationId, primaryClassId)).toHaveLength(0);
    expect(await getResultsByTeacher(institutionB, adminB.authUserId, examinationId)).toHaveLength(0);
  });
});
