/**
 * PROMPT EDU ERP — Task #418 follow-up: exam type periodicity (migration
 * 0043) and the "confirm scope of exam" redesign — listExamClasses()/
 * removeExamClass()/removeExamSubject() (modules/examination/service.ts),
 * added alongside the existing addExamClass()/addExamSubject() so the exam
 * detail page can show what's already linked and undo it, not just add to
 * it blindly.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamType, updateExamType,
  createExamination, addExamClass, listExamClasses, removeExamClass,
  addExamSubject, removeExamSubject, enterMarks,
} from "../../modules/examination/service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let classId: string, sectionId: string, subjectId: string, subjectId2: string;
let academicYearId: string;
let examinationId: string;
let studentId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "exam-scope-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@exam-scope-a.example", "Scope Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 9", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;
  const subj = await createSubject(institutionA, adminAuth, adminUserId, { name: "Physics" });
  subjectId = subj.id;
  const subj2 = await createSubject(institutionA, adminAuth, adminUserId, { name: "Chemistry" });
  subjectId2 = subj2.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  academicYearId = year!.id;

  const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ES-1", fullName: "Scope Student" });
  studentId = student.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId, classId, sectionId, academicYearId });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Exam type periodicity (§418 migration 0043)", () => {
  it("createExamType() accepts and persists an optional periodicity", async () => {
    const et = await createExamType(institutionA, adminAuth, adminUserId, {
      code: "PT1", name: "Periodic Test 1", category: "Academic", periodicity: "Periodic",
    });
    expect(et.periodicity).toBe("Periodic");

    const list = await listExamTypes(institutionA, adminAuth);
    const found = list.find((t) => t.id === et.id);
    expect(found?.periodicity).toBe("Periodic");
  });

  it("updateExamType() can change periodicity independently of category", async () => {
    const et = await createExamType(institutionA, adminAuth, adminUserId, {
      code: "CYC1", name: "Cyclic Test 1", periodicity: "Cyclic",
    });
    const updated = await updateExamType(institutionA, adminAuth, adminUserId, et.id, { periodicity: "Monthly" });
    expect(updated.periodicity).toBe("Monthly");
    expect(updated.category).toBeNull(); // untouched
  });

  it("periodicity stays null when never set (fully optional, §K no forced enum)", async () => {
    const et = await createExamType(institutionA, adminAuth, adminUserId, { code: "FIN1", name: "Final Exam" });
    expect(et.periodicity).toBeNull();
  });
});

describe("Exam scope: confirm classes/divisions (§418)", () => {
  it("createExamination() + addExamClass() + listExamClasses() round-trips class/division names", async () => {
    const examType = (await listExamTypes(institutionA, adminAuth))[0];
    const exam = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId, name: "Scope Test Exam",
    });
    examinationId = exam.id;

    await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);

    const linked = await listExamClasses(institutionA, adminAuth, examinationId);
    expect(linked).toHaveLength(1);
    expect(linked[0].class_name).toBe("Grade 9");
    expect(linked[0].section_name).toBe("A");
  });

  it("removeExamClass() unlinks it, and listExamClasses() reflects the removal", async () => {
    const linked = await listExamClasses(institutionA, adminAuth, examinationId);
    const examClassId = linked[0].id;
    await removeExamClass(institutionA, adminAuth, adminUserId, examClassId);

    const afterRemove = await listExamClasses(institutionA, adminAuth, examinationId);
    expect(afterRemove).toHaveLength(0);
  });

  it("removeExamClass() throws a clear error for an id that isn't linked", async () => {
    await expect(
      removeExamClass(institutionA, adminAuth, adminUserId, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(/isn't linked/);
  });
});

describe("Exam scope: confirm subjects + total marks (§418)", () => {
  it("addExamSubject() then removeExamSubject() removes a subject with no marks entered", async () => {
    const es = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId, subjectId, maxMarks: 100, passMarks: 35,
    });
    await removeExamSubject(institutionA, adminAuth, adminUserId, es.id);
    // Re-adding should succeed cleanly (proves the row was actually gone, not just hidden)
    const readded = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId, subjectId, maxMarks: 100, passMarks: 35,
    });
    expect(readded.subject_id).toBe(subjectId);
  });

  it("removeExamSubject() is BLOCKED once marks have been entered against it", async () => {
    // Re-link the class so enterMarks() (which joins through exam_classes) finds the enrolled student.
    await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);
    const es2 = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId, subjectId: subjectId2, maxMarks: 100, passMarks: 35,
    });
    await enterMarks(institutionA, adminAuth, adminUserId, es2.id, [
      { studentId, marksObtained: 78, isAbsent: false },
    ]);

    await expect(
      removeExamSubject(institutionA, adminAuth, adminUserId, es2.id)
    ).rejects.toThrow(/Marks have already been entered/);
  });

  it("removeExamSubject() throws a clear error for an id that isn't linked", async () => {
    await expect(
      removeExamSubject(institutionA, adminAuth, adminUserId, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(/isn't linked/);
  });
});
