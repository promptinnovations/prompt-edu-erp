/**
 * PROMPT EDU ERP — §Report-card-remark ("class teacher should have an
 * option for typing report card remark"): migration 0065 +
 * modules/report-card-remarks/service.ts. Covers the write-access rule
 * (class teacher of the student's own division only; admins anywhere),
 * blank-clears, the roster read and the per-examination isolation.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import { createTeacherAssignment } from "../../modules/staff/service";
import { listExamTypes, createExamination } from "../../modules/examination/service";
import {
  getReportCardRemarks, saveReportCardRemarks, listRemarkRoster, getClassTeacherCoverage, coverageIncludes,
} from "../../modules/report-card-remarks/service";

let inst: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let classId: string, sectionA: string, sectionB: string;
let studentA: string, studentB: string;
let exam1: string, exam2: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  inst = await seedDemoInstitution(db, "remarks-school");
  const admin = await seedDemoUser(db, inst, "admin@remarks.example", "Remarks Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const teacher = await seedDemoUser(db, inst, "teacher@remarks.example", "Remarks Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const year = await getCurrentAcademicYear(inst, adminAuth);
  if (!year) throw new Error("expected a current academic year");

  const cls = await createClass(inst, adminAuth, adminUserId, { name: "Grade 3", sortOrder: 1 });
  classId = cls.id;
  sectionA = (await createSection(inst, adminAuth, adminUserId, { classId, name: "A" })).id;
  sectionB = (await createSection(inst, adminAuth, adminUserId, { classId, name: "B" })).id;

  studentA = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "R-1", fullName: "Student In A" })).id;
  studentB = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "R-2", fullName: "Student In B" })).id;
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

  const examType = (await listExamTypes(inst, adminAuth)).find((t) => t.code === "academic_main");
  if (!examType) throw new Error("expected seeded exam type academic_main");
  exam1 = (await createExamination(inst, adminAuth, adminUserId, { examTypeId: examType.id, academicYearId: year.id, name: "Term 1" })).id;
  exam2 = (await createExamination(inst, adminAuth, adminUserId, { examTypeId: examType.id, academicYearId: year.id, name: "Term 2" })).id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("report card remarks", () => {
  it("resolves class-teacher coverage per division", async () => {
    const cov = await getClassTeacherCoverage(inst, teacherAuth, teacherUserId);
    expect(coverageIncludes(cov, classId, sectionA)).toBe(true);
    expect(coverageIncludes(cov, classId, sectionB)).toBe(false);
  });

  it("lets the class teacher write remarks for their own division", async () => {
    const res = await saveReportCardRemarks(inst, teacherAuth, teacherUserId, {
      examinationId: exam1, entries: [{ studentId: studentA, remark: "  Attentive and punctual.  " }],
    }, { unrestricted: false });
    expect(res).toEqual({ saved: 1, cleared: 0 });
    const remarks = await getReportCardRemarks(inst, teacherAuth, exam1);
    expect(remarks.get(studentA)).toBe("Attentive and punctual.");
  });

  it("refuses a student in another division unless unrestricted", async () => {
    await expect(saveReportCardRemarks(inst, teacherAuth, teacherUserId, {
      examinationId: exam1, entries: [{ studentId: studentB, remark: "Not my class" }],
    }, { unrestricted: false })).rejects.toThrow(/class teacher/i);
    expect((await getReportCardRemarks(inst, adminAuth, exam1)).has(studentB)).toBe(false);

    await saveReportCardRemarks(inst, adminAuth, adminUserId, {
      examinationId: exam1, entries: [{ studentId: studentB, remark: "Good progress in reading." }],
    }, { unrestricted: true });
    expect((await getReportCardRemarks(inst, adminAuth, exam1)).get(studentB)).toBe("Good progress in reading.");
  });

  it("keeps remarks per examination and lists them on the roster", async () => {
    expect((await getReportCardRemarks(inst, adminAuth, exam2)).size).toBe(0);
    const roster = await listRemarkRoster(inst, adminAuth, exam1, classId);
    expect(roster.map((r) => [r.full_name, r.remark])).toEqual([
      ["Student In A", "Attentive and punctual."],
      ["Student In B", "Good progress in reading."],
    ]);
    const onlyA = await listRemarkRoster(inst, adminAuth, exam1, classId, sectionA);
    expect(onlyA.map((r) => r.student_id)).toEqual([studentA]);
  });

  it("clears a remark when saved blank and rejects over-long text", async () => {
    const res = await saveReportCardRemarks(inst, teacherAuth, teacherUserId, {
      examinationId: exam1, entries: [{ studentId: studentA, remark: "   " }],
    }, { unrestricted: false });
    expect(res).toEqual({ saved: 0, cleared: 1 });
    expect((await getReportCardRemarks(inst, adminAuth, exam1)).has(studentA)).toBe(false);

    await expect(saveReportCardRemarks(inst, adminAuth, adminUserId, {
      examinationId: exam1, entries: [{ studentId: studentA, remark: "x".repeat(1001) }],
    }, { unrestricted: true })).rejects.toThrow();
  });
});
