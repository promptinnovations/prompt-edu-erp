/**
 * PROMPT EDU ERP — "Teachers can give access only to their respective
 * classes" follow-up. Exercises services/scope/teacher-scope-service.ts's
 * getTeacherClassScope() directly (the shared primitive), plus the two
 * concrete call sites it was built for: listStudentsForAdmin()'s new
 * `classIds` scoping option (students/classes hub) and
 * scopeIncludesSubjectInClass() (examinations marks-entry gate). The
 * attendance page's own class/section-picker filtering and the
 * "URL-crafted classId outside scope is ignored" guard are page-level
 * logic (app/(institution)/attendance/page.tsx) exercised manually/via the
 * build, not unit-testable without a Next.js render harness — this file
 * covers the data layer those pages are built on.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent, listStudentsForAdmin } from "../../modules/students/service";
import { createTeacherAssignment } from "../../modules/staff/service";
import {
  getTeacherClassScope, scopeIncludesSection, scopeIncludesSubjectInClass,
} from "../../services/scope/teacher-scope-service";

let institutionId: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string; // assigned to Class A only
let classAId: string, classBId: string;
let sectionA1Id: string, sectionA2Id: string;
let subjectMathId: string, subjectScienceId: string;
let academicYearId: string;
let studentAId: string, studentBId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionId = await seedDemoInstitution(db, "teacher-scope-school");
  const admin = await seedDemoUser(db, institutionId, "admin@teacher-scope.example", "Scope Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const teacher = await seedDemoUser(db, institutionId, "teacher@teacher-scope.example", "Scoped Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const classA = await createClass(institutionId, adminAuth, adminUserId, { name: "Class A", sortOrder: 1 });
  classAId = classA.id;
  const classB = await createClass(institutionId, adminAuth, adminUserId, { name: "Class B", sortOrder: 2 });
  classBId = classB.id;
  const sectionA1 = await createSection(institutionId, adminAuth, adminUserId, { classId: classAId, name: "A1" });
  sectionA1Id = sectionA1.id;
  const sectionA2 = await createSection(institutionId, adminAuth, adminUserId, { classId: classAId, name: "A2" });
  sectionA2Id = sectionA2.id;
  const sectionB1 = await createSection(institutionId, adminAuth, adminUserId, { classId: classBId, name: "B1" });

  const math = await createSubject(institutionId, adminAuth, adminUserId, { name: "Mathematics" });
  subjectMathId = math.id;
  const science = await createSubject(institutionId, adminAuth, adminUserId, { name: "Science" });
  subjectScienceId = science.id;

  const year = await getCurrentAcademicYear(institutionId, adminAuth);
  academicYearId = year!.id;

  const studentA = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "A-001", fullName: "Student In Class A" });
  studentAId = studentA.id;
  await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: studentAId, academicYearId, classId: classAId, sectionId: sectionA1Id });

  const studentB = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "B-001", fullName: "Student In Class B" });
  studentBId = studentB.id;
  await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: studentBId, academicYearId, classId: classBId, sectionId: sectionB1.id });

  // Scoped Teacher: class_teacher of Class A, section A1 only (NOT A2, NOT
  // Class B) — plus a subject_teacher row for Mathematics in Class A
  // (whole class, section_id null, so it covers both A1 and A2).
  await createTeacherAssignment(institutionId, adminAuth, adminUserId, {
    userId: teacherUserId, classId: classAId, sectionId: sectionA1Id, academicYearId, roleType: "class_teacher",
  });
  await createTeacherAssignment(institutionId, adminAuth, adminUserId, {
    userId: teacherUserId, classId: classAId, subjectId: subjectMathId, academicYearId, roleType: "subject_teacher",
  });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("getTeacherClassScope() — resolves teacher_assignments into a usable scope", () => {
  it("includes Class A but not Class B", async () => {
    const scope = await getTeacherClassScope(institutionId, teacherAuth, teacherUserId);
    expect(scope.classIds.has(classAId)).toBe(true);
    expect(scope.classIds.has(classBId)).toBe(false);
  });

  it("scopeIncludesSection: section A1 (explicitly assigned) is included, A2 is NOT (whole-class assignment was for Math only, a different mechanism)", async () => {
    const scope = await getTeacherClassScope(institutionId, teacherAuth, teacherUserId);
    expect(scopeIncludesSection(scope, classAId, sectionA1Id)).toBe(true);
    // The subject_teacher row has section_id = null, which marks classAId
    // as "all sections" for scoping purposes — so A2 IS included via that
    // whole-class assignment, even though the class_teacher row was A1-only.
    expect(scopeIncludesSection(scope, classAId, sectionA2Id)).toBe(true);
  });

  it("scopeIncludesSubjectInClass: Mathematics in Class A is authorized, Science is not", async () => {
    const scope = await getTeacherClassScope(institutionId, teacherAuth, teacherUserId);
    expect(scopeIncludesSubjectInClass(scope, classAId, subjectMathId)).toBe(true);
    expect(scopeIncludesSubjectInClass(scope, classAId, subjectScienceId)).toBe(false);
    expect(scopeIncludesSubjectInClass(scope, classBId, subjectMathId)).toBe(false);
  });

  it("a teacher with zero assignments gets an empty scope, not an error", async () => {
    const db = await getDbClient();
    const unassigned = await seedDemoUser(db, institutionId, "unassigned@teacher-scope.example", "Unassigned Teacher", "teacher");
    const scope = await getTeacherClassScope(institutionId, unassigned.authUserId, unassigned.userId);
    expect(scope.classIds.size).toBe(0);
  });
});

describe("listStudentsForAdmin() classIds scoping — the Students/Classes-hub call site", () => {
  it("with no classIds (unrestricted/management view), returns every student", async () => {
    const all = await listStudentsForAdmin(institutionId, adminAuth, {});
    expect(all.some((s) => s.id === studentAId)).toBe(true);
    expect(all.some((s) => s.id === studentBId)).toBe(true);
  });

  it("with classIds scoped to Class A only, Class B's student is excluded", async () => {
    const scoped = await listStudentsForAdmin(institutionId, teacherAuth, { classIds: [classAId] });
    expect(scoped.some((s) => s.id === studentAId)).toBe(true);
    expect(scoped.some((s) => s.id === studentBId)).toBe(false);
  });

  it("with classIds = [] (a scoped teacher with no assignments at all), returns nothing rather than everything", async () => {
    const scoped = await listStudentsForAdmin(institutionId, teacherAuth, { classIds: [] });
    expect(scoped).toHaveLength(0);
  });
});

describe("Tenant isolation for teacher_assignments-based scoping", () => {
  it("a teacher from a different institution resolves an empty scope, never another tenant's assignments", async () => {
    const db = await getDbClient();
    const otherInstitution = await seedDemoInstitution(db, "teacher-scope-other");
    const otherTeacher = await seedDemoUser(db, otherInstitution, "teacher@other.example", "Other Teacher", "teacher");
    const scope = await getTeacherClassScope(otherInstitution, otherTeacher.authUserId, otherTeacher.userId);
    expect(scope.classIds.size).toBe(0);
  });
});
