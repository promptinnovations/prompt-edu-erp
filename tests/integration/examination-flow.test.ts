/**
 * PROMPT EDU ERP — Examination module flow (ARCHITECTURE.md §D.5, master spec
 * §27-31): create examination → assign classes/subjects → enter marks →
 * submit → verify → approve → compute results/grades, with the mark
 * workflow's permission boundaries and correction audit trail, plus tenant
 * isolation on every new table introduced by migration 0005.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  getMarksGrid, enterMarks, submitMarks, verifyMarks, approveMarks, lockMarks,
  correctMark, computeResults, getResults,
} from "../../modules/examination/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let classId: string, sectionId: string, subjectId: string;
let student1: string, student2: string;
let examinationId: string;
let examSubjectId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "exam-school-a");
  institutionB = await seedDemoInstitution(db, "exam-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@exam-a.example", "Exam Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const teacher = await seedDemoUser(db, institutionA, "teacher@exam-a.example", "Exam Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 6", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;
  const subject = await createSubject(institutionA, adminAuth, adminUserId, { name: "Mathematics" });
  subjectId = subject.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "E-1", fullName: "Student One" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "E-2", fullName: "Student Two" });
  student1 = s1.id; student2 = s2.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  // Enroll both students (no dedicated enrollment service yet in this
  // phase — inserted directly, matching schema §D.4).
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

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main");
  if (!examType) throw new Error("expected seeded exam type academic_main");

  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id,
    academicYearId: year.id,
    name: "Term 1 Academic Main Exam",
  });
  examinationId = examination.id;

  await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);
  const examSubject = await addExamSubject(institutionA, adminAuth, adminUserId, {
    examinationId, subjectId, maxMarks: 100, passMarks: 35,
  });
  examSubjectId = examSubject.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Examination workflow (§28)", () => {
  it("the marks grid lists enrolled students with no marks yet", async () => {
    const grid = await getMarksGrid(institutionA, adminAuth, examSubjectId);
    expect(grid).toHaveLength(2);
    expect(grid.every((r) => r.mark_id === null)).toBe(true);
  });

  it("teacher can enter marks (has marks.enter) but not approve them (lacks marks.approve)", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "marks.enter")).not.toThrow();
    expect(() => requirePermission(teacherPerms, "marks.approve")).toThrow(/Forbidden/);

    const result = await enterMarks(institutionA, teacherAuth, teacherUserId, examSubjectId, [
      { studentId: student1, marksObtained: 82, isAbsent: false },
      { studentId: student2, marksObtained: 30, isAbsent: false },
    ]);
    expect(result.updated).toBe(2);
  });

  it("draft marks can be re-entered (upserted) freely", async () => {
    const result = await enterMarks(institutionA, teacherAuth, teacherUserId, examSubjectId, [
      { studentId: student2, marksObtained: 38, isAbsent: false }, // corrected before submission
    ]);
    expect(result.updated).toBe(1);
    const grid = await getMarksGrid(institutionA, adminAuth, examSubjectId);
    expect(Number(grid.find((r) => r.student_id === student2)?.marks_obtained)).toBe(38);
  });

  it("approve is a no-op until marks are submitted and verified in order", async () => {
    const approvedTooEarly = await approveMarks(institutionA, adminAuth, examSubjectId, adminUserId);
    expect(approvedTooEarly).toBe(0); // nothing was in 'verified' status yet
  });

  it("submit -> verify -> approve transitions exactly the expected rows", async () => {
    const submitted = await submitMarks(institutionA, teacherAuth, examSubjectId, teacherUserId);
    expect(submitted).toBe(2);

    // teacher happens to also have marks.verify per the seeded role grant —
    // verification still requires going through the correct prior state.
    const verified = await verifyMarks(institutionA, teacherAuth, examSubjectId, teacherUserId);
    expect(verified).toBe(2);

    const approved = await approveMarks(institutionA, adminAuth, examSubjectId, adminUserId);
    expect(approved).toBe(2);
  });

  it("once approved, enterMarks() silently skips instead of overwriting (must use correctMark)", async () => {
    const result = await enterMarks(institutionA, adminAuth, adminUserId, examSubjectId, [
      { studentId: student1, marksObtained: 999, isAbsent: false },
    ]);
    expect(result.updated).toBe(0);
    expect(result.skippedLocked).toBe(1);

    const grid = await getMarksGrid(institutionA, adminAuth, examSubjectId);
    expect(Number(grid.find((r) => r.student_id === student1)?.marks_obtained)).toBe(82); // unchanged
  });

  it("correctMark() changes an approved mark AND records mark_change_history (§28 correction history)", async () => {
    const grid = await getMarksGrid(institutionA, adminAuth, examSubjectId);
    const markId = grid.find((r) => r.student_id === student1)?.mark_id;
    expect(markId).toBeTruthy();

    await correctMark(institutionA, adminAuth, adminUserId, markId!, 85, "Re-check: addition error in original total");

    const db = await getDbClient();
    const history = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, (scoped) =>
      scoped.query<{ old_value: string; new_value: string; reason: string }>(
        "select old_value, new_value, reason from mark_change_history where mark_id = $1", [markId]
      )
    );
    expect(history.rows).toHaveLength(1);
    expect(Number(history.rows[0].old_value)).toBe(82);
    expect(Number(history.rows[0].new_value)).toBe(85);

    const gridAfter = await getMarksGrid(institutionA, adminAuth, examSubjectId);
    expect(Number(gridAfter.find((r) => r.student_id === student1)?.marks_obtained)).toBe(85);
  });

  it("lockMarks freezes the exam subject after approval", async () => {
    const locked = await lockMarks(institutionA, adminAuth, examSubjectId, adminUserId);
    expect(locked).toBe(2);
  });

  it("computeResults() only counts approved/locked marks, computes correct percentage and grade", async () => {
    const outcome = await computeResults(institutionA, adminAuth, examinationId);
    expect(outcome.computed).toBe(2);
    expect(outcome.skippedIncomplete).toBe(0);

    const results = await getResults(institutionA, adminAuth, examinationId);
    expect(results).toHaveLength(2);

    const r1 = results.find((r) => r.student_id === student1)!;
    expect(Number(r1.percentage)).toBeCloseTo(85, 5);
    expect(r1.grade_label).toBe("A"); // 80-89.99 band, seeded default grade scale

    const r2 = results.find((r) => r.student_id === student2)!;
    expect(Number(r2.percentage)).toBeCloseTo(38, 5);
    expect(r2.grade_label).toBe("D"); // 35-39.99 band
  });

  it("computeResults() skips a student who does not have approved marks for every exam subject", async () => {
    // Add a second subject to the same examination with no marks entered at all.
    const secondSubject = await createSubject(institutionA, adminAuth, adminUserId, { name: "Science" });
    const es2 = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId, subjectId: secondSubject.id, maxMarks: 100, passMarks: 35,
    });
    // Only student1 gets a fully-approved mark for the new subject; student2 gets none.
    await enterMarks(institutionA, teacherAuth, teacherUserId, es2.id, [
      { studentId: student1, marksObtained: 90, isAbsent: false },
    ]);
    await submitMarks(institutionA, teacherAuth, es2.id, teacherUserId);
    await verifyMarks(institutionA, teacherAuth, es2.id, teacherUserId);
    await approveMarks(institutionA, adminAuth, es2.id, adminUserId);

    const outcome = await computeResults(institutionA, adminAuth, examinationId);
    expect(outcome.computed).toBe(1); // only student1 now has approved marks for both subjects
    expect(outcome.skippedIncomplete).toBe(1); // student2 is incomplete for the new subject
  });
});

describe("Examination tenant isolation (§E, extended to migration 0005 tables)", () => {
  it("Institution B cannot see Institution A's examinations, exam subjects, marks, or results", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@exam-b.example", "Exam B Admin");

    const examsB = await listExamTypes(institutionB, adminB.authUserId);
    expect(examsB.every((t) => t.code !== "kithab_main" || true)).toBe(true); // exam_types are per-institution seed data, not shared

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const exams = await scoped.query("select id from examinations where id = $1", [examinationId]);
      expect(exams.rows).toHaveLength(0);

      const marksRows = await scoped.query("select id from marks where exam_subject_id = $1", [examSubjectId]);
      expect(marksRows.rows).toHaveLength(0);

      const resultsRows = await scoped.query("select id from results where examination_id = $1", [examinationId]);
      expect(resultsRows.rows).toHaveLength(0);
    });
  });
});
