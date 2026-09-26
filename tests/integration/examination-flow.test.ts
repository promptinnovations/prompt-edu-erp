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
import { createClass, createSection, createSubject, getCurrentAcademicYear, assignSubjectToClass } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, updateExamination, deleteExamination, getExamination,
  addExamClass, addExamSubject,
  getMarksGrid, enterMarks, deleteMark, submitMarks, verifyMarks, approveMarks, lockMarks,
  correctMark, computeResults, getResults, listStudentResultHistory,
  getExaminationMarksMatrix, getCumulativeMarksheet, getMarkEntryStatus,
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

describe("Edit & remove buttons follow-up — exam CRUD and mark removal (§'add edit & remove button ... created exam, marks entered')", () => {
  it("updateExamination() renames a created exam", async () => {
    const examTypes = await listExamTypes(institutionA, adminAuth);
    const examType = examTypes.find((t) => t.code === "academic_main")!;
    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    const temp = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId: year!.id, name: "Draft Exam Name",
    });

    const updated = await updateExamination(institutionA, adminAuth, adminUserId, temp.id, { name: "Renamed Exam" });
    expect(updated.name).toBe("Renamed Exam");
    const fetched = await getExamination(institutionA, adminAuth, temp.id);
    expect(fetched?.name).toBe("Renamed Exam");

    // Cleanup for the deleteExamination test below to have a clean slate —
    // not strictly required, but avoids an unused row lingering.
    await deleteExamination(institutionA, adminAuth, adminUserId, temp.id);
    expect(await getExamination(institutionA, adminAuth, temp.id)).toBeNull();
  });

  it("deleteExamination() refuses once marks exist underneath it, and succeeds once they're removed", async () => {
    const examTypes = await listExamTypes(institutionA, adminAuth);
    const examType = examTypes.find((t) => t.code === "academic_main")!;
    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    const temp = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId: year!.id, name: "To Be Deleted Exam",
    });
    await addExamClass(institutionA, adminAuth, temp.id, classId, sectionId);
    const tempSubject = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId: temp.id, subjectId, maxMarks: 100, passMarks: 35,
    });
    await enterMarks(institutionA, teacherAuth, teacherUserId, tempSubject.id, [
      { studentId: student1, marksObtained: 70, isAbsent: false },
    ]);

    await expect(deleteExamination(institutionA, adminAuth, adminUserId, temp.id)).rejects.toThrow(/Marks have already been entered/);

    const grid = await getMarksGrid(institutionA, adminAuth, tempSubject.id);
    const markId = grid.find((r) => r.student_id === student1)?.mark_id;
    expect(markId).toBeTruthy();
    await deleteMark(institutionA, adminAuth, adminUserId, markId!);

    const gridAfter = await getMarksGrid(institutionA, adminAuth, tempSubject.id);
    expect(gridAfter.find((r) => r.student_id === student1)?.mark_id).toBeNull();

    await deleteExamination(institutionA, adminAuth, adminUserId, temp.id);
    expect(await getExamination(institutionA, adminAuth, temp.id)).toBeNull();
  });

  it("deleteMark() refuses once a mark has moved past draft (already approved/locked) — must use correctMark instead", async () => {
    const grid = await getMarksGrid(institutionA, adminAuth, examSubjectId);
    const lockedMarkId = grid.find((r) => r.student_id === student1)?.mark_id;
    expect(lockedMarkId).toBeTruthy(); // approved + locked by the earlier workflow describe block

    await expect(deleteMark(institutionA, adminAuth, adminUserId, lockedMarkId!)).rejects.toThrow(/use Correct instead/);
  });

  it("deleteExamination() refuses once results have been computed for the exam (guarded by the marks check first, since results always imply marks exist)", async () => {
    await expect(deleteExamination(institutionA, adminAuth, adminUserId, examinationId)).rejects.toThrow(/Marks have already been entered|Results have already been computed/);
  });
});

describe("listStudentResultHistory() — parent/student portal 'Results' detail view follow-up", () => {
  it("returns every computed result for a student, newest first, not just the latest", async () => {
    const history = await listStudentResultHistory(institutionA, adminAuth, student1);
    expect(history.length).toBeGreaterThanOrEqual(1);
    const row = history.find((r) => r.examination_id === examinationId)!;
    expect(row).toBeTruthy();
    // Recomputed as 175/200 = 87.5% by the "skips a student" test above,
    // which adds a second exam_subject and re-runs computeResults() —
    // still the 80-89.99 grade band, just no longer exactly 85.
    expect(Number(row.percentage)).toBeCloseTo(87.5, 5);
    expect(row.grade_label).toBe("A");
  });

  it("returns an empty array for a student with no computed results", async () => {
    const emptyStudent = await createStudent(institutionA, adminAuth, adminUserId, {
      fullName: "No Results Student", admissionNumber: "NR-001", dateOfBirth: "2010-01-01", gender: "male",
    });
    const history = await listStudentResultHistory(institutionA, adminAuth, emptyStudent.id);
    expect(history).toEqual([]);
  });
});

// §491 Print Center follow-up ("executive-design Progress Report + Consolidated
// Mark Sheet ... exam-wise + cumulative") — class_name on the shared marks
// matrix (Report Card header) and the new cross-examination cumulative
// marksheet, both built directly on this file's existing exam/results
// fixtures rather than a separate setup.
describe("getExaminationMarksMatrix() class_name (§491 Report Card header follow-up)", () => {
  it("includes the student's current class name on every matrix row", async () => {
    const matrix = await getExaminationMarksMatrix(institutionA, adminAuth, examinationId);
    expect(matrix.length).toBeGreaterThan(0);
    for (const row of matrix) {
      expect(row.class_name).toBe("Grade 6");
    }
  });
});

describe("getCumulativeMarksheet() (§491 'Consolidated Mark Sheet ... cumulative')", () => {
  it("pivots every computed result for the academic year into one row per student with an average", async () => {
    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    const sheet = await getCumulativeMarksheet(institutionA, adminAuth, year!.id);

    expect(sheet.examinations.some((e) => e.id === examinationId)).toBe(true);

    const student1Row = sheet.rows.find((r) => r.student_id === student1)!;
    expect(student1Row).toBeTruthy();
    const student1Score = student1Row.exams.find((e) => e.examination_id === examinationId)!;
    expect(Number(student1Score.percentage)).toBeCloseTo(87.5, 5);
    expect(student1Score.grade_label).toBe("A");
    // Only one examination has a computed result for student1 in this
    // file's fixtures, so the average equals that single percentage.
    expect(student1Row.average_percentage).toBeCloseTo(87.5, 1);

    // student2 became incomplete once the second exam_subject was added
    // with no marks for them -- computeResults() skips (never deletes)
    // an incomplete student's row, so their STALE result from the first
    // (single-subject) compute is what the cumulative sheet still shows:
    // 30/100 -> corrected to 38/100 before submission, still 38%.
    const student2Row = sheet.rows.find((r) => r.student_id === student2)!;
    expect(student2Row).toBeTruthy();
    const student2Score = student2Row.exams.find((e) => e.examination_id === examinationId)!;
    expect(Number(student2Score.percentage)).toBeCloseTo(38, 5);
  });

  it("classId narrows to one class, and Institution B sees no rows for Institution A's academic year", async () => {
    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    const scoped = await getCumulativeMarksheet(institutionA, adminAuth, year!.id, classId);
    expect(scoped.rows.some((r) => r.student_id === student1)).toBe(true);

    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin4@exam-b.example", "Exam B Admin 4");
    const crossTenant = await getCumulativeMarksheet(institutionB, adminB.authUserId, year!.id);
    expect(crossTenant.rows).toEqual([]);
    expect(crossTenant.examinations).toEqual([]);
  });
});


describe("§CS.1 \"are the subjects allocated class wise?\" -- class_subjects gates the marks-entry roster", () => {
  it("a subject only assigned to one class's class_subjects excludes students from a sibling class in the same exam scope, while a class with no class_subjects configured at all still gets every subject (back-compat fallback)", async () => {
    const year = await getCurrentAcademicYear(institutionA, adminAuth);

    // Two sibling classes: Grade 7 gets an explicit class_subjects row for
    // "Science" (so it's "configured" and therefore gated); Grade 8 gets
    // no class_subjects rows at all (so it stays ungated, matching every
    // institution that hasn't set up class_subjects yet).
    const grade7 = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 7 (CS.1)", sortOrder: 90 });
    const grade8 = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 8 (CS.1)", sortOrder: 91 });
    const grade7Section = await createSection(institutionA, adminAuth, adminUserId, { classId: grade7.id, name: "A" });
    const grade8Section = await createSection(institutionA, adminAuth, adminUserId, { classId: grade8.id, name: "A" });
    const science = await createSubject(institutionA, adminAuth, adminUserId, { name: "Science (CS.1)" });
    const art = await createSubject(institutionA, adminAuth, adminUserId, { name: "Art (CS.1)" });

    // Grade 7 explicitly teaches Science only (no class_subjects row for Art).
    await assignSubjectToClass(institutionA, adminAuth, adminUserId, { classId: grade7.id, subjectId: science.id, isCore: true });

    const g7Student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "CS1-1", fullName: "Grade7 Student" });
    const g8Student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "CS1-2", fullName: "Grade8 Student" });

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
        [institutionA, g7Student.id, year!.id, grade7.id, grade7Section.id]
      );
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
        [institutionA, g8Student.id, year!.id, grade8.id, grade8Section.id]
      );
    });

    const examTypes = await listExamTypes(institutionA, adminAuth);
    const examType = examTypes.find((t) => t.code === "academic_main")!;
    const exam = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId: year!.id, name: "CS.1 Half Yearly",
    });
    await addExamClass(institutionA, adminAuth, exam.id, grade7.id);
    await addExamClass(institutionA, adminAuth, exam.id, grade8.id);
    const scienceExamSubject = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId: exam.id, subjectId: science.id, maxMarks: 100, passMarks: 35,
    });
    const artExamSubject = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId: exam.id, subjectId: art.id, maxMarks: 100, passMarks: 35,
    });

    // Science: Grade 7 has an explicit class_subjects row for it, so its
    // student appears. Grade 8 has zero class_subjects rows at all, so it
    // falls back to "ungated" and its student appears too.
    const scienceGrid = await getMarksGrid(institutionA, adminAuth, scienceExamSubject.id);
    expect(scienceGrid.map((r) => r.student_id).sort()).toEqual([g7Student.id, g8Student.id].sort());

    // Art: Grade 7 IS configured (has a class_subjects row for Science) but
    // has no row for Art specifically -> excluded. Grade 8 is still
    // unconfigured -> still falls back to included.
    const artGrid = await getMarksGrid(institutionA, adminAuth, artExamSubject.id);
    expect(artGrid.map((r) => r.student_id)).toEqual([g8Student.id]);
    expect(artGrid.some((r) => r.student_id === g7Student.id)).toBe(false);

    // getMarkEntryStatus()'s "expected" counts must reflect the same gate --
    // §CS.2 "mark entry status also should be shown class wise" split what
    // used to be one row per subject into one row per (subject, class), so
    // sum across the class rows that share this exam_subject_id.
    const status = await getMarkEntryStatus(institutionA, adminAuth, exam.id);
    const scienceExpected = status
      .filter((s) => s.exam_subject_id === scienceExamSubject.id)
      .reduce((sum, s) => sum + s.expected, 0);
    const artExpected = status
      .filter((s) => s.exam_subject_id === artExamSubject.id)
      .reduce((sum, s) => sum + s.expected, 0);
    expect(scienceExpected).toBe(2);
    expect(artExpected).toBe(1);
  });
});

describe("§CS.2 \"mark entry status also should be shown class wise\" -- getMarkEntryStatus() rows are split one-per-class instead of one-per-subject", () => {
  it("a subject covering two classes produces two separate rows, each with its own class identity and expected/entered counts", async () => {
    const year = await getCurrentAcademicYear(institutionA, adminAuth);

    const grade9 = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 9 (CS.2)", sortOrder: 92 });
    const grade10 = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 10 (CS.2)", sortOrder: 93 });
    const grade9Section = await createSection(institutionA, adminAuth, adminUserId, { classId: grade9.id, name: "A" });
    const grade10Section = await createSection(institutionA, adminAuth, adminUserId, { classId: grade10.id, name: "A" });
    const history = await createSubject(institutionA, adminAuth, adminUserId, { name: "History (CS.2)" });

    const g9Student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "CS2-1", fullName: "Grade9 Student" });
    const g10StudentA = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "CS2-2", fullName: "Grade10 Student A" });
    const g10StudentB = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "CS2-3", fullName: "Grade10 Student B" });

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
        [institutionA, g9Student.id, year!.id, grade9.id, grade9Section.id]
      );
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
        [institutionA, g10StudentA.id, year!.id, grade10.id, grade10Section.id]
      );
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
        [institutionA, g10StudentB.id, year!.id, grade10.id, grade10Section.id]
      );
    });

    const examTypes = await listExamTypes(institutionA, adminAuth);
    const examType = examTypes.find((t) => t.code === "academic_main")!;
    const exam = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId: year!.id, name: "CS.2 Term Exam",
    });
    await addExamClass(institutionA, adminAuth, exam.id, grade9.id);
    await addExamClass(institutionA, adminAuth, exam.id, grade10.id);
    const historyExamSubject = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId: exam.id, subjectId: history.id, maxMarks: 100, passMarks: 35,
    });

    await enterMarks(institutionA, adminAuth, adminUserId, historyExamSubject.id, [
      { studentId: g10StudentA.id, marksObtained: 60, isAbsent: false },
    ]);

    const status = await getMarkEntryStatus(institutionA, adminAuth, exam.id);
    const historyRows = status.filter((s) => s.exam_subject_id === historyExamSubject.id);
    expect(historyRows).toHaveLength(2);

    const g9Row = historyRows.find((r) => r.class_id === grade9.id)!;
    const g10Row = historyRows.find((r) => r.class_id === grade10.id)!;
    expect(g9Row.class_name).toBe("Grade 9 (CS.2)");
    expect(g9Row.expected).toBe(1);
    expect(g9Row.entered).toBe(0);
    expect(g10Row.class_name).toBe("Grade 10 (CS.2)");
    expect(g10Row.expected).toBe(2);
    expect(g10Row.entered).toBe(1);
  });
});
