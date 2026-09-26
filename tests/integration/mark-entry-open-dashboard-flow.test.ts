/**
 * PROMPT EDU ERP — "an exam of which the mark entry is open should be
 * available in the dashboard of every teacher, but only classes/subjects
 * concerned" follow-up. Exercises getOpenMarkEntryForTeacher()
 * (modules/examination/service.ts) directly: scoping to a teacher's own
 * classes/subjects (via teacher_assignments, same primitive
 * teacher-class-scope-flow.test.ts covers), the not_started/in_progress/
 * locked bucketing, and Daily Assessment exclusion. The dashboard widget
 * itself (app/(institution)/dashboard/page.tsx) is page-level rendering,
 * exercised via the build/typecheck, not unit-tested here.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createTeacherAssignment } from "../../modules/staff/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, lockMarks,
  getOpenMarkEntryForTeacher,
} from "../../modules/examination/service";

let institutionId: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string; // Class A / Mathematics only
let classAId: string, classBId: string;
let sectionA1Id: string;
let subjectMathId: string, subjectScienceId: string;
let academicYearId: string;
let studentA1Id: string, studentA2Id: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionId = await seedDemoInstitution(db, "open-mark-entry-school");
  const admin = await seedDemoUser(db, institutionId, "admin@open-mark-entry.example", "OME Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const teacher = await seedDemoUser(db, institutionId, "teacher@open-mark-entry.example", "OME Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const classA = await createClass(institutionId, adminAuth, adminUserId, { name: "Class A", sortOrder: 1 });
  classAId = classA.id;
  const classB = await createClass(institutionId, adminAuth, adminUserId, { name: "Class B", sortOrder: 2 });
  classBId = classB.id;
  const sectionA1 = await createSection(institutionId, adminAuth, adminUserId, { classId: classAId, name: "A1" });
  sectionA1Id = sectionA1.id;
  const sectionB1 = await createSection(institutionId, adminAuth, adminUserId, { classId: classBId, name: "B1" });

  const math = await createSubject(institutionId, adminAuth, adminUserId, { name: "Mathematics" });
  subjectMathId = math.id;
  const science = await createSubject(institutionId, adminAuth, adminUserId, { name: "Science" });
  subjectScienceId = science.id;

  const year = await getCurrentAcademicYear(institutionId, adminAuth);
  academicYearId = year!.id;

  const studentA1 = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "OME-A1", fullName: "Student A1" });
  studentA1Id = studentA1.id;
  await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: studentA1Id, academicYearId, classId: classAId, sectionId: sectionA1Id });
  const studentA2 = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "OME-A2", fullName: "Student A2" });
  studentA2Id = studentA2.id;
  await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: studentA2Id, academicYearId, classId: classAId, sectionId: sectionA1Id });

  const studentB = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "OME-B1", fullName: "Student B1" });
  await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: studentB.id, academicYearId, classId: classBId, sectionId: sectionB1.id });

  // Teacher is a subject_teacher of Mathematics in Class A only -- not
  // Science, not Class B.
  await createTeacherAssignment(institutionId, adminAuth, adminUserId, {
    userId: teacherUserId, classId: classAId, subjectId: subjectMathId, academicYearId, roleType: "subject_teacher",
  });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("getOpenMarkEntryForTeacher() -- teacher-facing 'open for mark entry' widget", () => {
  it("scopes to the teacher's own classes/subjects only, and buckets not_started/in_progress correctly", async () => {
    const examTypes = await listExamTypes(institutionId, adminAuth);
    const examType = examTypes.find((t) => !t.is_daily_assessment)!;
    const exam = await createExamination(institutionId, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId, name: "OME Term Exam",
    });
    await addExamClass(institutionId, adminAuth, exam.id, classAId);
    await addExamClass(institutionId, adminAuth, exam.id, classBId);

    const mathExamSubject = await addExamSubject(institutionId, adminAuth, adminUserId, {
      examinationId: exam.id, subjectId: subjectMathId, maxMarks: 100, passMarks: 35,
    });
    const scienceExamSubject = await addExamSubject(institutionId, adminAuth, adminUserId, {
      examinationId: exam.id, subjectId: subjectScienceId, maxMarks: 100, passMarks: 35,
    });

    // Before any marks are entered: Math/Class A shows up (not_started).
    // Science/Class A is excluded (teacher isn't assigned to Science
    // anywhere). Math/Class B is excluded (teacher isn't assigned to Class
    // B at all).
    let rows = await getOpenMarkEntryForTeacher(institutionId, adminAuth, teacherUserId);
    expect(rows).toHaveLength(1);
    expect(rows[0].examSubjectId).toBe(mathExamSubject.id);
    expect(rows[0].classId).toBe(classAId);
    expect(rows[0].status).toBe("not_started");
    void scienceExamSubject;

    // Entering (draft) marks for ONE of the two Class A roster students
    // flips it to in_progress -- still "open" (nothing locked yet).
    await enterMarks(institutionId, adminAuth, adminUserId, mathExamSubject.id, [
      { studentId: studentA1Id, marksObtained: 78, isAbsent: false },
    ]);
    rows = await getOpenMarkEntryForTeacher(institutionId, adminAuth, teacherUserId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("in_progress");

    // Entering the second student's mark too, still draft -- remains
    // in_progress (not locked yet).
    await enterMarks(institutionId, adminAuth, adminUserId, mathExamSubject.id, [
      { studentId: studentA2Id, marksObtained: 82, isAbsent: false },
    ]);
    rows = await getOpenMarkEntryForTeacher(institutionId, adminAuth, teacherUserId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("in_progress");

    // Progress every roster student's mark all the way to 'locked' --
    // the (exam_subject, class) pair should now be dropped entirely, no
    // longer "open".
    await submitMarks(institutionId, adminAuth, mathExamSubject.id, adminUserId);
    await verifyMarks(institutionId, adminAuth, mathExamSubject.id, adminUserId);
    await approveMarks(institutionId, adminAuth, mathExamSubject.id, adminUserId);
    await lockMarks(institutionId, adminAuth, mathExamSubject.id, adminUserId);

    rows = await getOpenMarkEntryForTeacher(institutionId, adminAuth, teacherUserId);
    expect(rows).toHaveLength(0);
  });

  it("excludes Daily Assessment exam types entirely, even for a class/subject the teacher is assigned to", async () => {
    const examTypes = await listExamTypes(institutionId, adminAuth);
    const dailyType = examTypes.find((t) => t.is_daily_assessment)!;
    const register = await createExamination(institutionId, adminAuth, adminUserId, {
      examTypeId: dailyType.id, academicYearId, name: "ignored — Daily Assessment names itself",
    });
    await addExamClass(institutionId, adminAuth, register.id, classAId);
    await addExamSubject(institutionId, adminAuth, adminUserId, {
      examinationId: register.id, subjectId: subjectMathId, maxMarks: 10, passMarks: 4,
    });

    const rows = await getOpenMarkEntryForTeacher(institutionId, adminAuth, teacherUserId);
    expect(rows.some((r) => r.examinationId === register.id)).toBe(false);
  });

  it("a teacher with zero assignments gets an empty list, not an error", async () => {
    const db = await getDbClient();
    const unassigned = await seedDemoUser(db, institutionId, "unassigned@open-mark-entry.example", "Unassigned Teacher", "teacher");
    const rows = await getOpenMarkEntryForTeacher(institutionId, unassigned.authUserId, unassigned.userId);
    expect(rows).toHaveLength(0);
  });
});
