/**
 * PROMPT EDU ERP — §Student-details ("incomplete details — class teachers
 * must be able to fill them"): modules/student-details/service.ts.
 * Covers the write-access rule (class teacher of the student's own division
 * only; admins anywhere), blanks never erasing saved data, placeholder /
 * wrong mobile numbers counting as missing, father records being updated
 * in place and mother records being created and linked.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, createParent, linkParentToStudent, listParentsForStudent, getStudent } from "../../modules/students/service";
import { createTeacherAssignment } from "../../modules/staff/service";
import {
  saveStudentDetails, listDetailsRoster, missingDetails, countIncompleteStudents,
  getClassTeacherCoverage, isValidPhone, normalisePhone,
} from "../../modules/student-details/service";

let inst: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let classId: string, sectionA: string, sectionB: string;
let studentA: string, studentB: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  inst = await seedDemoInstitution(db, "details-school");
  const admin = await seedDemoUser(db, inst, "admin@details.example", "Details Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const teacher = await seedDemoUser(db, inst, "teacher@details.example", "Details Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const year = await getCurrentAcademicYear(inst, adminAuth);
  if (!year) throw new Error("expected a current academic year");

  classId = (await createClass(inst, adminAuth, adminUserId, { name: "Grade 4", sortOrder: 1 })).id;
  sectionA = (await createSection(inst, adminAuth, adminUserId, { classId, name: "A" })).id;
  sectionB = (await createSection(inst, adminAuth, adminUserId, { classId, name: "B" })).id;

  // Imported the way the bulk import does it: father record with a placeholder mobile.
  studentA = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "D-1", fullName: "Student In A", gender: "M" })).id;
  studentB = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "D-2", fullName: "Student In B" })).id;
  const fatherA = await createParent(inst, adminAuth, adminUserId, { fullName: "Father A", phone: "To be updated", email: null, occupation: null });
  await linkParentToStudent(inst, adminAuth, adminUserId, { studentId: studentA, parentId: fatherA.id, relationship: "Father", isPrimaryContact: true });

  await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
    for (const [sid, sec] of [[studentA, sectionA], [studentB, sectionB]]) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
        [inst, sid, year.id, classId, sec]
      );
    }
  });

  // The teacher is class teacher of division A only.
  await createTeacherAssignment(inst, adminAuth, adminUserId, {
    userId: teacherUserId, classId, sectionId: sectionA, academicYearId: year.id, roleType: "class_teacher",
  });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("phone rules", () => {
  it("treats placeholders and short numbers as missing, normalises +91", () => {
    expect(isValidPhone("To be updated")).toBe(false);
    expect(isValidPhone("953911862")).toBe(false);
    expect(isValidPhone("9847012345")).toBe(true);
    expect(normalisePhone("+91 98470 12345")).toBe("9847012345");
    expect(normalisePhone("+971 50 123 4567")).toBe("+971501234567");
    expect(normalisePhone("12345")).toBeNull();
  });
});

describe("complete student details", () => {
  it("lists what is missing for each student", async () => {
    const roster = await listDetailsRoster(inst, adminAuth, classId, null);
    const a = roster.find((r) => r.student_id === studentA)!;
    const b = roster.find((r) => r.student_id === studentB)!;
    expect(missingDetails(a)).toEqual(["dateOfBirth", "fatherPhone"]);
    expect(missingDetails(b)).toEqual(["dateOfBirth", "gender", "fatherName", "fatherPhone"]);
    expect(await countIncompleteStudents(inst, adminAuth, null)).toEqual({ incomplete: 2, total: 2 });
    const cov = await getClassTeacherCoverage(inst, teacherAuth, teacherUserId);
    expect(await countIncompleteStudents(inst, teacherAuth, cov)).toEqual({ incomplete: 1, total: 1 });
  });

  it("lets the class teacher fill their own division's student", async () => {
    const res = await saveStudentDetails(inst, teacherAuth, teacherUserId, {
      studentId: studentA, dateOfBirth: "2016-05-14", fatherPhone: "+91 98470 12345", motherName: "Mother A", motherPhone: "",
    }, { unrestricted: false });
    expect(res.changed).toEqual(["date of birth", "father's mobile", "mother's name"]);
    const student = await getStudent(inst, adminAuth, studentA);
    expect(student?.gender).toBe("M"); // untouched
    const [rowA] = await listDetailsRoster(inst, adminAuth, classId, sectionA);
    expect(rowA.date_of_birth).toBe("2016-05-14");
    const parents = await listParentsForStudent(inst, adminAuth, studentA);
    expect(parents.find((p) => p.relationship === "Father")).toMatchObject({ full_name: "Father A", phone: "9847012345" });
    expect(parents.find((p) => p.relationship === "Mother")).toMatchObject({ full_name: "Mother A", phone: null });
    const roster = await listDetailsRoster(inst, adminAuth, classId, sectionA);
    expect(missingDetails(roster[0])).toEqual([]);
  });

  it("never erases saved data with a blank field", async () => {
    await saveStudentDetails(inst, teacherAuth, teacherUserId, {
      studentId: studentA, dateOfBirth: "", gender: "", fatherName: "", fatherPhone: "",
    }, { unrestricted: false });
    const parents = await listParentsForStudent(inst, adminAuth, studentA);
    expect(parents.find((p) => p.relationship === "Father")?.phone).toBe("9847012345");
    const student = await getStudent(inst, adminAuth, studentA);
    expect(student?.date_of_birth).not.toBeNull();
  });

  it("refuses another division's student for a class teacher", async () => {
    await expect(saveStudentDetails(inst, teacherAuth, teacherUserId, {
      studentId: studentB, dateOfBirth: "2016-01-01",
    }, { unrestricted: false })).rejects.toThrow(/class teacher/);
  });

  it("rejects bad dates and bad mobile numbers", async () => {
    await expect(saveStudentDetails(inst, teacherAuth, teacherUserId, { studentId: studentA, dateOfBirth: "2999-01-01" }, { unrestricted: false }))
      .rejects.toThrow(/future/);
    await expect(saveStudentDetails(inst, teacherAuth, teacherUserId, { studentId: studentA, fatherPhone: "95391186" }, { unrestricted: false }))
      .rejects.toThrow(/10 digits/);
  });

  it("lets an admin fill any student and creates a missing father record", async () => {
    await expect(saveStudentDetails(inst, adminAuth, adminUserId, { studentId: studentB, fatherPhone: "9847000000" }, { unrestricted: true }))
      .rejects.toThrow(/father's name/);
    const res = await saveStudentDetails(inst, adminAuth, adminUserId, {
      studentId: studentB, dateOfBirth: "2016-02-02", gender: "female", fatherName: "Father B", fatherPhone: "9847000000",
    }, { unrestricted: true });
    expect(res.changed).toContain("father's name");
    const parents = await listParentsForStudent(inst, adminAuth, studentB);
    expect(parents[0]).toMatchObject({ full_name: "Father B", phone: "9847000000", relationship: "Father", is_primary_contact: true });
    expect(await countIncompleteStudents(inst, adminAuth, null)).toEqual({ incomplete: 0, total: 2 });
  });
});
