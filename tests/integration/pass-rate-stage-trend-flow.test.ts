/**
 * PROMPT EDU ERP — Dashboard follow-up ("do the same of attendance trend
 * for [pass rate] as well — Y axis 0-100%, X-axis each exams — different
 * section different colour").
 *
 * Exercises modules/examination/service.ts's
 * getInstitutionPassRateTrendByStage() — the per-STAGE breakdown of the
 * existing getInstitutionPassRateTrend(), one row per (examination, stage)
 * pair, oldest-exam-first, classes with no stage grouped under
 * 'Unspecified'.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, computeResults,
  getInstitutionPassRateTrendByStage,
} from "../../modules/examination/service";

let institutionA: string, institutionB: string;
let adminAuth: string, adminUserId: string;
let kgClassId: string, kgSectionId: string, hsClassId: string, hsSectionId: string, unspecifiedClassId: string, unspecifiedSectionId: string;
let mathId: string;
let exam1Id: string, exam2Id: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "prt-school-a");
  institutionB = await seedDemoInstitution(db, "prt-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@prt-a.example", "PRT Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const kgClass = await createClass(institutionA, adminAuth, adminUserId, { name: "LKG", sortOrder: 1, stage: "KG" });
  kgClassId = kgClass.id;
  const kgSection = await createSection(institutionA, adminAuth, adminUserId, { classId: kgClassId, name: "A" });
  kgSectionId = kgSection.id;

  const hsClass = await createClass(institutionA, adminAuth, adminUserId, { name: "Class 9", sortOrder: 2, stage: "HS" });
  hsClassId = hsClass.id;
  const hsSection = await createSection(institutionA, adminAuth, adminUserId, { classId: hsClassId, name: "A" });
  hsSectionId = hsSection.id;

  const unspecifiedClass = await createClass(institutionA, adminAuth, adminUserId, { name: "Class 10", sortOrder: 3 });
  unspecifiedClassId = unspecifiedClass.id;
  const unspecifiedSection = await createSection(institutionA, adminAuth, adminUserId, { classId: unspecifiedClassId, name: "A" });
  unspecifiedSectionId = unspecifiedSection.id;

  const math = await createSubject(institutionA, adminAuth, adminUserId, { name: "Mathematics" });
  mathId = math.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main")!;

  // createExamination() has no startDate input (start_date is set some
  // other way, not at creation) — ordering here relies on the same
  // fallback getInstitutionPassRateTrend()/...ByStage() themselves use:
  // coalesce(start_date, created_at), so exams must be created in the
  // order they should appear, oldest first.
  async function runExam(name: string, students: { classId: string; sectionId: string; admissionPrefix: string; marks: number[] }[]) {
    const examination = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId: year!.id, name,
    });
    const examSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId: examination.id, subjectId: mathId, maxMarks: 100, passMarks: 35 });

    const entries: { studentId: string; marksObtained: number; isAbsent: boolean }[] = [];
    for (const group of students) {
      await addExamClass(institutionA, adminAuth, examination.id, group.classId, group.sectionId);
      for (const [i, marks] of group.marks.entries()) {
        const student = await createStudent(institutionA, adminAuth, adminUserId, {
          admissionNumber: `${group.admissionPrefix}-${name}-${i}`, fullName: `${group.admissionPrefix} Student ${name} ${i}`,
        });
        await enrollStudent(institutionA, adminAuth, adminUserId, {
          studentId: student.id, academicYearId: year!.id, classId: group.classId, sectionId: group.sectionId,
        });
        entries.push({ studentId: student.id, marksObtained: marks, isAbsent: false });
      }
    }

    await enterMarks(institutionA, adminAuth, adminUserId, examSubject.id, entries);
    await submitMarks(institutionA, adminAuth, examSubject.id, adminUserId);
    await verifyMarks(institutionA, adminAuth, examSubject.id, adminUserId);
    await approveMarks(institutionA, adminAuth, examSubject.id, adminUserId);
    const outcome = await computeResults(institutionA, adminAuth, examination.id);
    expect(outcome.computed).toBe(entries.length);
    return examination.id;
  }

  // Exam One (created first — earlier in the trend): KG both pass (100%),
  // HS 1 pass/1 fail (50%).
  exam1Id = await runExam("Exam One", [
    { classId: kgClassId, sectionId: kgSectionId, admissionPrefix: "KG", marks: [80, 90] },
    { classId: hsClassId, sectionId: hsSectionId, admissionPrefix: "HS", marks: [80, 20] },
  ]);

  // Exam Two (created second — later in the trend): KG 1 pass/1 fail (50%),
  // HS both pass (100%), plus one Unspecified-stage student who also
  // passes (100%).
  exam2Id = await runExam("Exam Two", [
    { classId: kgClassId, sectionId: kgSectionId, admissionPrefix: "KG2", marks: [80, 20] },
    { classId: hsClassId, sectionId: hsSectionId, admissionPrefix: "HS2", marks: [80, 90] },
    { classId: unspecifiedClassId, sectionId: unspecifiedSectionId, admissionPrefix: "U", marks: [80] },
  ]);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("getInstitutionPassRateTrendByStage()", () => {
  it("breaks each exam's pass rate out per stage", async () => {
    const points = await getInstitutionPassRateTrendByStage(institutionA, adminAuth, 5);
    const stages = new Set(points.map((p) => p.stage));
    expect(stages.has("KG")).toBe(true);
    expect(stages.has("HS")).toBe(true);
  });

  it("Exam One: KG is 100%, HS is 50%", async () => {
    const points = await getInstitutionPassRateTrendByStage(institutionA, adminAuth, 5);
    const kg = points.find((p) => p.examinationId === exam1Id && p.stage === "KG");
    const hs = points.find((p) => p.examinationId === exam1Id && p.stage === "HS");
    expect(kg?.percentage).toBe(100);
    expect(kg?.totalStudents).toBe(2);
    expect(hs?.percentage).toBe(50);
    expect(hs?.totalStudents).toBe(2);
  });

  it("Exam Two: KG is 50%, HS is 100%, and the Unspecified-stage class groups separately", async () => {
    const points = await getInstitutionPassRateTrendByStage(institutionA, adminAuth, 5);
    const kg = points.find((p) => p.examinationId === exam2Id && p.stage === "KG");
    const hs = points.find((p) => p.examinationId === exam2Id && p.stage === "HS");
    const unspecified = points.find((p) => p.examinationId === exam2Id && p.stage === "Unspecified");
    expect(kg?.percentage).toBe(50);
    expect(hs?.percentage).toBe(100);
    expect(unspecified?.percentage).toBe(100);
    expect(unspecified?.totalStudents).toBe(1);
  });

  it("orders exams oldest-to-newest (Exam One before Exam Two)", async () => {
    const points = await getInstitutionPassRateTrendByStage(institutionA, adminAuth, 5);
    const examIdsInOrder = [...new Set(points.map((p) => p.examinationId))];
    expect(examIdsInOrder.indexOf(exam1Id)).toBeLessThan(examIdsInOrder.indexOf(exam2Id));
  });

  it("carries the readable examination name through, not just the id", async () => {
    const points = await getInstitutionPassRateTrendByStage(institutionA, adminAuth, 5);
    const row = points.find((p) => p.examinationId === exam1Id);
    expect(row?.examinationName).toBe("Exam One");
  });

  it("tenant isolation: Institution B has no pass-rate data at all", async () => {
    const points = await getInstitutionPassRateTrendByStage(institutionB, adminAuth, 5);
    expect(points).toEqual([]);
  });

  it("respects the limit parameter (0 recent exams when limit=0)", async () => {
    const points = await getInstitutionPassRateTrendByStage(institutionA, adminAuth, 0);
    expect(points).toEqual([]);
  });
});
