/**
 * PROMPT EDU ERP — Student Profile flow smoke test. Proves: migration 0035's
 * new columns apply cleanly, admitStudent() enforces the three
 * admission-mandatory field groups (core identity, family contact, address)
 * while creating/linking father+mother `parents` rows, and
 * getStudentProfile()/updateStudentProfile() round-trip the full template.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import {
  admitStudent, getStudentProfile, updateStudentProfile, listParentsForStudent,
} from "../../modules/students/service";
import { createClass, createSection, createSubject, listAcademicYears } from "../../modules/academic/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject, enterMarks, submitMarks, verifyMarks, approveMarks,
  getStudentExamReport,
} from "../../modules/examination/service";
import { listAttendanceStatuses, markAttendance, getStudentMonthlyAttendance } from "../../modules/attendance/service";

let institutionId: string;
let adminAuth: string, adminUserId: string;
let academicYearId: string, classId: string, sectionId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionId = await seedDemoInstitution(db, "sp-school");
  const admin = await seedDemoUser(db, institutionId, "admin@sp-school.example", "SP Institution Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const years = await listAcademicYears(institutionId, adminAuth);
  academicYearId = years.find((y) => y.is_current)?.id ?? years[0].id;
  const cls = await createClass(institutionId, adminAuth, adminUserId, { name: "Grade 5", sortOrder: 1 });
  classId = cls.id;
  const sec = await createSection(institutionId, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = sec.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("admitStudent — mandatory field enforcement", () => {
  it("refuses admission with no parent name/phone at all", async () => {
    await expect(
      admitStudent(institutionId, adminAuth, adminUserId, {
        admissionNumber: "SP-001", fullName: "No Parent Kid", dateOfBirth: "2015-01-01", gender: "male",
        academicYearId, classId, sectionId, address: "123 Main St",
      })
    ).rejects.toThrow();
  });

  it("refuses admission with a parent name but no phone", async () => {
    await expect(
      admitStudent(institutionId, adminAuth, adminUserId, {
        admissionNumber: "SP-002", fullName: "No Phone Kid", dateOfBirth: "2015-01-01", gender: "male",
        academicYearId, classId, sectionId, address: "123 Main St",
        father: { fullName: "Father Guy" },
      })
    ).rejects.toThrow();
  });

  it("admits a student with core identity + family contact + address, links father & mother", async () => {
    const { student, enrollment } = await admitStudent(institutionId, adminAuth, adminUserId, {
      admissionNumber: "SP-003", fullName: "Full Kid", dateOfBirth: "2015-06-15", gender: "female",
      academicYearId, classId, sectionId, address: "42 Palm Grove",
      father: { fullName: "Father Guy", phone: "9990001111", occupation: "Engineer" },
      mother: { fullName: "Mother Guy", phone: "9990002222" },
      profile: { bloodGroup: "O+", hobbiesTalents: "Chess" },
    });
    expect(student.id).toBeTruthy();
    expect(enrollment.class_id).toBe(classId);

    const profile = await getStudentProfile(institutionId, adminAuth, student.id);
    expect(profile?.address).toBe("42 Palm Grove");
    expect(profile?.blood_group).toBe("O+");
    expect(profile?.hobbies_talents).toBe("Chess");

    const parents = await listParentsForStudent(institutionId, adminAuth, student.id);
    expect(parents.map((p) => p.relationship).sort()).toEqual(["father", "mother"]);
    expect(parents.find((p) => p.relationship === "father")?.is_primary_contact).toBe(true);
  });

  it("succeeds with only a mother's name+phone (no father record at all)", async () => {
    const { student } = await admitStudent(institutionId, adminAuth, adminUserId, {
      admissionNumber: "SP-004", fullName: "Mother Only Kid", dateOfBirth: "2016-02-02", gender: "male",
      academicYearId, classId, sectionId, address: "7 Lotus Lane",
      mother: { fullName: "Solo Mother", phone: "9990003333" },
    });
    const parents = await listParentsForStudent(institutionId, adminAuth, student.id);
    expect(parents).toHaveLength(1);
    expect(parents[0].relationship).toBe("mother");
  });
});

describe("updateStudentProfile — partial updates", () => {
  it("updates only the given fields, leaves others untouched", async () => {
    const { student } = await admitStudent(institutionId, adminAuth, adminUserId, {
      admissionNumber: "SP-005", fullName: "Partial Update Kid", dateOfBirth: "2015-09-09", gender: "female",
      academicYearId, classId, sectionId, address: "9 Rose St",
      father: { fullName: "Update Father", phone: "9990004444" },
      profile: { bloodGroup: "A+" },
    });

    await updateStudentProfile(institutionId, adminAuth, adminUserId, student.id, { motherTongue: "Malayalam" });

    const profile = await getStudentProfile(institutionId, adminAuth, student.id);
    expect(profile?.blood_group).toBe("A+"); // untouched
    expect(profile?.mother_tongue).toBe("Malayalam"); // newly set
  });
});

describe("getStudentExamReport — Academics/Summary tab per-subject breakdown", () => {
  it("returns null when the student has no approved marks anywhere yet", async () => {
    const { student } = await admitStudent(institutionId, adminAuth, adminUserId, {
      admissionNumber: "SP-006", fullName: "No Marks Kid", dateOfBirth: "2015-01-01", gender: "male",
      academicYearId, classId, sectionId, address: "1 No Marks St",
      father: { fullName: "No Marks Father", phone: "9990005555" },
    });
    const report = await getStudentExamReport(institutionId, adminAuth, student.id);
    expect(report).toBeNull();
  });

  it("breaks down the most recent exam's marks by subject once approved", async () => {
    const { student } = await admitStudent(institutionId, adminAuth, adminUserId, {
      admissionNumber: "SP-007", fullName: "Exam Report Kid", dateOfBirth: "2015-01-01", gender: "female",
      academicYearId, classId, sectionId, address: "2 Exam St",
      father: { fullName: "Exam Father", phone: "9990006666" },
    });

    const maths = await createSubject(institutionId, adminAuth, adminUserId, { name: "Maths (Profile Test)" });
    const science = await createSubject(institutionId, adminAuth, adminUserId, { name: "Science (Profile Test)" });

    const examTypes = await listExamTypes(institutionId, adminAuth);
    const examType = examTypes.find((t) => t.code === "academic_main");
    if (!examType) throw new Error("expected seeded exam type academic_main");

    const examination = await createExamination(institutionId, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId, name: "Profile Test Exam",
    });
    await addExamClass(institutionId, adminAuth, examination.id, classId, sectionId);
    const esMaths = await addExamSubject(institutionId, adminAuth, adminUserId, { examinationId: examination.id, subjectId: maths.id, maxMarks: 100, passMarks: 35 });
    const esScience = await addExamSubject(institutionId, adminAuth, adminUserId, { examinationId: examination.id, subjectId: science.id, maxMarks: 50, passMarks: 20 });

    for (const es of [esMaths, esScience]) {
      await enterMarks(institutionId, adminAuth, adminUserId, es.id, [{ studentId: student.id, marksObtained: es.id === esMaths.id ? 80 : 40, isAbsent: false }]);
      await submitMarks(institutionId, adminAuth, es.id, adminUserId);
      await verifyMarks(institutionId, adminAuth, es.id, adminUserId);
      await approveMarks(institutionId, adminAuth, es.id, adminUserId);
    }

    const report = await getStudentExamReport(institutionId, adminAuth, student.id);
    expect(report?.examination_name).toBe("Profile Test Exam");
    expect(report?.subjects).toHaveLength(2);
    const mathsRow = report?.subjects.find((s) => s.subject_id === maths.id);
    expect(Number(mathsRow?.marks_obtained)).toBe(80);
    expect(Number(mathsRow?.max_marks)).toBe(100);
  });
});

describe("getStudentMonthlyAttendance — Summary tab bar chart", () => {
  it("groups present/absent counts by calendar month", async () => {
    const { student } = await admitStudent(institutionId, adminAuth, adminUserId, {
      admissionNumber: "SP-008", fullName: "Attendance Chart Kid", dateOfBirth: "2015-01-01", gender: "male",
      academicYearId, classId, sectionId, address: "3 Attendance St",
      father: { fullName: "Attendance Father", phone: "9990007777" },
    });

    const statuses = await listAttendanceStatuses(institutionId, adminAuth);
    const present = statuses.find((s) => s.counts_as_present);
    const absent = statuses.find((s) => !s.counts_as_present);
    if (!present || !absent) throw new Error("expected seeded present/absent attendance statuses");

    await markAttendance(institutionId, adminAuth, adminUserId, {
      classId, sectionId, date: "2026-01-05", entries: [{ studentId: student.id, statusId: present.id, isLate: false }],
    });
    await markAttendance(institutionId, adminAuth, adminUserId, {
      classId, sectionId, date: "2026-01-06", entries: [{ studentId: student.id, statusId: absent.id, isLate: false }],
    });
    await markAttendance(institutionId, adminAuth, adminUserId, {
      classId, sectionId, date: "2026-02-03", entries: [{ studentId: student.id, statusId: present.id, isLate: false }],
    });

    const points = await getStudentMonthlyAttendance(institutionId, adminAuth, student.id, "2026-01-01", "2026-02-28");
    expect(points).toEqual([
      { month: "2026-01", present: 1, absent: 1, total: 2 },
      { month: "2026-02", present: 1, absent: 0, total: 1 },
    ]);
  });
});
