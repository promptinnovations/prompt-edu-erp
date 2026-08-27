/**
 * PROMPT EDU ERP — Teacher Profile feature: the 6-section profile
 * (Personal/Employment/Qualifications & Skills/Responsibilities/
 * Professional Development/Achievements, migration 0036), the
 * lazily-seeded classroom-observation rubric + admin CRUD
 * (observation_criteria), the rubric-driven Term-wise Performance
 * Observation (recordTeacherObservationWithRubric, including the
 * staff.observation.manage_section stage-scoping the user chose in
 * AskUserQuestion #2), and the per-class/subject exam-analysis table +
 * growth/fall trend (getTeacherExamReport/getTeacherPerformanceTrend).
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
  createStaffMember, createTeacherAssignment, listStaff, getStaffMember,
  getStaffProfile, updateStaffProfile, updateStaffPhoto,
  listObservationCriteria, createObservationCriterion, updateObservationCriterion, deleteObservationCriterion,
  recordTeacherObservationWithRubric, listTeacherObservations,
} from "../../modules/staff/service";
import { assignSectionHead } from "../../services/scope/section-head-scope-service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject, enterMarks, submitMarks, verifyMarks, approveMarks,
  listExaminations,
} from "../../modules/examination/service";
import { getTeacherExamReport, getTeacherPerformanceTrend } from "../../modules/analytics/service";
import { uploadFile } from "../../services/storage/file-service";
import { DEFAULT_OBSERVATION_CRITERIA } from "../../modules/staff/observation-rubric-defaults";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let sectionHeadHsAuth: string, sectionHeadHsUserId: string;
let hsClassId: string, hsSectionId: string, lpClassId: string;
let scienceId: string;
let academicYearId: string;
let teacherHsId: string, teacherHsUserId: string; // staff.id / users.id, assigned to the HS-stage class
let teacherLpId: string, teacherLpUserId: string; // assigned to the LP-stage class only

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "tp-school-a");
  institutionB = await seedDemoInstitution(db, "tp-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@tp-a.example", "TP Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const sectionHeadHs = await seedDemoUser(db, institutionA, "sh-hs@tp-a.example", "HS Section Head", "section_head");
  sectionHeadHsAuth = sectionHeadHs.authUserId; sectionHeadHsUserId = sectionHeadHs.userId;
  await assignSectionHead(institutionA, adminAuth, sectionHeadHsUserId, "HS");

  const hsClass = await createClass(institutionA, adminAuth, adminUserId, { name: "TP Grade 8", sortOrder: 1, stage: "HS" });
  hsClassId = hsClass.id;
  const hsSection = await createSection(institutionA, adminAuth, adminUserId, { classId: hsClassId, name: "A" });
  hsSectionId = hsSection.id;
  const lpClass = await createClass(institutionA, adminAuth, adminUserId, { name: "TP Grade 3", sortOrder: 2, stage: "LP" });
  lpClassId = lpClass.id;

  const science = await createSubject(institutionA, adminAuth, adminUserId, { name: "TP Science" });
  scienceId = science.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");
  academicYearId = year.id;

  const teacherHs = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "tp-teacher-hs@tp-a.example", fullName: "TP HS Teacher", staffCode: "TP-T1", employmentStatus: "active", roleCode: "teacher",
  });
  teacherHsId = teacherHs.id; teacherHsUserId = teacherHs.user_id;
  await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
    userId: teacherHsUserId, classId: hsClassId, sectionId: hsSectionId, subjectId: scienceId, academicYearId, roleType: "subject_teacher",
  });

  const teacherLp = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "tp-teacher-lp@tp-a.example", fullName: "TP LP Teacher", staffCode: "TP-T2", employmentStatus: "active", roleCode: "teacher",
  });
  teacherLpId = teacherLp.id; teacherLpUserId = teacherLp.user_id;
  await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
    userId: teacherLpUserId, classId: lpClassId, subjectId: scienceId, academicYearId, roleType: "subject_teacher",
  });

  // Four students enrolled in the HS class/section, for the exam-report test.
  const names = ["TP-S1", "TP-S2", "TP-S3", "TP-S4"];
  const studentIds: string[] = [];
  for (const code of names) {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: code, fullName: `Student ${code}` });
    studentIds.push(s.id);
  }
  await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    for (const sid of studentIds) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
         values ($1, $2, $3, $4, $5)`,
        [institutionA, sid, academicYearId, hsClassId, hsSectionId]
      );
    }
  });

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main")!;

  // Exam 1 — students score 90/50/75/20 (pass_marks 35 -> 3 pass, 1 fail).
  const exam1 = await createExamination(institutionA, adminAuth, adminUserId, { examTypeId: examType.id, academicYearId, name: "TP Exam 1" });
  await addExamClass(institutionA, adminAuth, exam1.id, hsClassId, hsSectionId);
  const es1 = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId: exam1.id, subjectId: scienceId, maxMarks: 100, passMarks: 35 });
  await enterMarks(institutionA, adminAuth, adminUserId, es1.id, [
    { studentId: studentIds[0], marksObtained: 90, isAbsent: false },
    { studentId: studentIds[1], marksObtained: 50, isAbsent: false },
    { studentId: studentIds[2], marksObtained: 75, isAbsent: false },
    { studentId: studentIds[3], marksObtained: 20, isAbsent: false },
  ]);
  await submitMarks(institutionA, adminAuth, es1.id, adminUserId);
  await verifyMarks(institutionA, adminAuth, es1.id, adminUserId);
  await approveMarks(institutionA, adminAuth, es1.id, adminUserId);

  // Exam 2 — every student scores 50 (a "fall" from exam 1's 58.75% average).
  const exam2 = await createExamination(institutionA, adminAuth, adminUserId, { examTypeId: examType.id, academicYearId, name: "TP Exam 2" });
  await addExamClass(institutionA, adminAuth, exam2.id, hsClassId, hsSectionId);
  const es2 = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId: exam2.id, subjectId: scienceId, maxMarks: 100, passMarks: 35 });
  await enterMarks(institutionA, adminAuth, adminUserId, es2.id, studentIds.map((studentId) => ({ studentId, marksObtained: 50, isAbsent: false })));
  await submitMarks(institutionA, adminAuth, es2.id, adminUserId);
  await verifyMarks(institutionA, adminAuth, es2.id, adminUserId);
  await approveMarks(institutionA, adminAuth, es2.id, adminUserId);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Staff profile read/write (§Teacher-Profile, migration 0036)", () => {
  it("getStaffProfile() returns null for every new template field until set", async () => {
    const profile = await getStaffProfile(institutionA, adminAuth, teacherHsId);
    expect(profile?.qualifications ?? null).toBeNull();
    expect(profile?.blood_group ?? null).toBeNull();
  });

  it("updateStaffProfile() is a true partial update — a second call touching one field leaves earlier fields intact", async () => {
    await updateStaffProfile(institutionA, adminAuth, adminUserId, teacherHsId, {
      bloodGroup: "O+", qualifications: "B.Sc Physics",
    });
    await updateStaffProfile(institutionA, adminAuth, adminUserId, teacherHsId, {
      skills: "ICT, robotics",
    });
    const profile = await getStaffProfile(institutionA, adminAuth, teacherHsId);
    expect(profile?.blood_group).toBe("O+");
    expect(profile?.qualifications).toBe("B.Sc Physics");
    expect(profile?.skills).toBe("ICT, robotics");
  });

  it("updateStaffPhoto() sets and then clears photo_file_id; refuses a file from another institution", async () => {
    const uploaded = await uploadFile(institutionA, adminAuth, adminUserId, {
      entityType: "staff", entityId: teacherHsId, fileName: "photo.png", mimeType: "image/png", isPublic: false, bytes: Buffer.from("x"),
    });
    await updateStaffPhoto(institutionA, adminAuth, adminUserId, teacherHsId, uploaded.id);
    expect((await getStaffProfile(institutionA, adminAuth, teacherHsId))?.photo_file_id).toBe(uploaded.id);

    // §Staff-photo-visibility follow-up ("once photo is added it should be
    // visible everywhere") -- listStaff()/getStaffMember() are what feeds
    // the Staff directory card grid (a DIFFERENT query than
    // getStaffProfile() above, which only backs the profile page itself),
    // and must reflect the same photo, not just the profile page.
    const directoryRow = (await listStaff(institutionA, adminAuth)).find((s) => s.id === teacherHsId);
    expect(directoryRow?.photo_file_id).toBe(uploaded.id);
    expect((await getStaffMember(institutionA, adminAuth, teacherHsId))?.photo_file_id).toBe(uploaded.id);

    await updateStaffPhoto(institutionA, adminAuth, adminUserId, teacherHsId, null);
    expect((await getStaffProfile(institutionA, adminAuth, teacherHsId))?.photo_file_id).toBeNull();
    expect((await listStaff(institutionA, adminAuth)).find((s) => s.id === teacherHsId)?.photo_file_id).toBeNull();

    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@tp-b.example", "TP B Admin", "institution_admin");
    const fileInB = await uploadFile(institutionB, adminB.authUserId, adminB.userId, {
      entityType: "staff", entityId: crypto.randomUUID(), fileName: "other.png", mimeType: "image/png", isPublic: false, bytes: Buffer.from("y"),
    });
    await expect(
      updateStaffPhoto(institutionA, adminAuth, adminUserId, teacherHsId, fileInB.id)
    ).rejects.toThrow(/does not belong to this institution/);
  });
});

describe("Observation rubric — lazy default seed + admin CRUD (§Teacher-Profile AskUserQuestion #1)", () => {
  it("listObservationCriteria() seeds the PDF-sourced default rubric on first call, and never duplicates it on later calls", async () => {
    const first = await listObservationCriteria(institutionA, adminAuth);
    expect(first).toHaveLength(DEFAULT_OBSERVATION_CRITERIA.length);
    expect(first[0].levels_jsonb).toHaveLength(5);

    const second = await listObservationCriteria(institutionA, adminAuth);
    expect(second).toHaveLength(DEFAULT_OBSERVATION_CRITERIA.length);
    expect(second.map((c) => c.id).sort()).toEqual(first.map((c) => c.id).sort());
  });

  it("createObservationCriterion()/updateObservationCriterion()/deleteObservationCriterion() manage the rubric", async () => {
    const before = await listObservationCriteria(institutionA, adminAuth);
    const created = await createObservationCriterion(institutionA, adminAuth, adminUserId, {
      domain: "F. Extra", criteriaText: "21. Bonus criterion", sortOrder: 21,
      levels: [1, 2, 3, 4, 5].map((score) => ({ score, descriptor: `D${score}`, explanation: `E${score}` })),
    });
    expect((await listObservationCriteria(institutionA, adminAuth))).toHaveLength(before.length + 1);

    const updated = await updateObservationCriterion(institutionA, adminAuth, adminUserId, created.id, {
      domain: "F. Extra", criteriaText: "21. Bonus criterion (revised)", sortOrder: 21,
      levels: [1, 2, 3, 4, 5].map((score) => ({ score, descriptor: `D${score}`, explanation: `E${score}` })),
    });
    expect(updated?.criteria_text).toBe("21. Bonus criterion (revised)");

    await deleteObservationCriterion(institutionA, adminAuth, adminUserId, created.id);
    expect((await listObservationCriteria(institutionA, adminAuth))).toHaveLength(before.length);
  });
});

describe("Rubric-driven Term-wise Performance Observation (§Teacher-Profile AskUserQuestion #2)", () => {
  it("recordTeacherObservationWithRubric() computes totalScore scaled against the FULL rubric, not just the criteria submitted", async () => {
    const criteria = await listObservationCriteria(institutionA, adminAuth);
    const [c1, c2] = criteria; // c1 score 5, c2 score 4 -> raw 9, scaled over criteria.length*5 (=100 for the 20-criterion default)
    const obs = await recordTeacherObservationWithRubric(institutionA, adminAuth, adminUserId, {
      teacherId: teacherHsId, date: "2026-08-10", term: "Term 1", classDiv: "HS 8 A", content: "Science lesson",
      items: [{ criteriaId: c1.id, score: 5 }, { criteriaId: c2.id, score: 4 }],
      overallNotes: "Well prepared.", followUpNotes: "More group activities.",
    });
    expect(obs.teacher_id).toBe(teacherHsId);
    expect(obs.overall_notes).toBe("Well prepared.");
    const payload = obs.criteria_jsonb as { totalScore: number; term: string };
    const expectedTotal = Math.round((9 / (criteria.length * 5)) * 10000) / 100;
    expect(payload.totalScore).toBeCloseTo(expectedTotal, 2);
    expect(payload.term).toBe("Term 1");
  });

  it("a Section Head scoped to 'HS' can observe the HS teacher but not the LP teacher", async () => {
    const criteria = await listObservationCriteria(institutionA, adminAuth);
    const item = { criteriaId: criteria[0].id, score: 3 };

    const allowed = await recordTeacherObservationWithRubric(
      institutionA, sectionHeadHsAuth, sectionHeadHsUserId,
      { teacherId: teacherHsId, date: "2026-08-11", items: [item] },
      { scopedToOwnSection: true }
    );
    expect(allowed.observer_id).toBe(sectionHeadHsUserId);

    await expect(
      recordTeacherObservationWithRubric(
        institutionA, sectionHeadHsAuth, sectionHeadHsUserId,
        { teacherId: teacherLpId, date: "2026-08-11", items: [item] },
        { scopedToOwnSection: true }
      )
    ).rejects.toThrow(/own assigned section/);
  });

  it("section_head role holds staff.view + staff.observation.manage_section but not the unrestricted staff.observation.manage", async () => {
    const perms = await getPermissionsForUser(sectionHeadHsAuth, sectionHeadHsUserId, institutionA);
    expect(() => requirePermission(perms, "staff.view")).not.toThrow();
    expect(() => requirePermission(perms, "staff.observation.manage_section")).not.toThrow();
    expect(() => requirePermission(perms, "staff.observation.manage")).toThrow(/Forbidden/);
  });

  it("listTeacherObservations() surfaces both recorded observations for the HS teacher", async () => {
    const observations = await listTeacherObservations(institutionA, adminAuth, teacherHsId);
    expect(observations.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Teacher exam-report — per-class/subject analysis (§Teacher-Profile 'image 1')", () => {
  it("getTeacherExamReport() breaks a single examination down by class/division/subject with grade-band and failed counts", async () => {
    const [exam1] = (await listExaminations(institutionA, adminAuth)).filter((e) => e.name === "TP Exam 1");
    const report = await getTeacherExamReport(institutionA, adminAuth, teacherHsUserId, exam1.id);
    expect(report).not.toBeNull();
    expect(report!.rows).toHaveLength(1);

    const row = report!.rows[0];
    expect(row.class_name).toBe("TP Grade 8");
    expect(row.section_name).toBe("A");
    expect(row.subject_name).toBe("TP Science");
    expect(row.students).toBe(4);
    expect(row.full_marks).toBe(100);
    expect(row.average_marks).toBeCloseTo(58.75, 2);
    expect(row.pass_percentage).toBeCloseTo(75, 1); // 3 of 4 passed (pass_marks 35)
    expect(row.failed_count).toBe(1);
    expect(Object.values(row.grade_counts).reduce((a, b) => a + b, 0)).toBe(4);

    expect(report!.overall_percentage).toBeCloseTo(58.75, 2);
    expect(report!.overall_pass_percentage).toBeCloseTo(75, 1);
  });

  it("getTeacherPerformanceTrend() returns one point per examination, oldest to newest, showing the fall from exam 1 to exam 2", async () => {
    const trend = await getTeacherPerformanceTrend(institutionA, adminAuth, teacherHsUserId, 10);
    expect(trend.length).toBeGreaterThanOrEqual(2);
    const names = trend.map((t) => t.examinationName);
    expect(names.indexOf("TP Exam 1")).toBeLessThan(names.indexOf("TP Exam 2")); // oldest first
    const exam1Point = trend.find((t) => t.examinationName === "TP Exam 1")!;
    const exam2Point = trend.find((t) => t.examinationName === "TP Exam 2")!;
    expect(exam1Point.percentage).toBeCloseTo(58.75, 2);
    expect(exam2Point.percentage).toBeCloseTo(50, 2);
  });
});

describe("Teacher Profile tenant isolation (§E)", () => {
  it("Institution B cannot see Institution A's staff profile fields or observation criteria", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "iso@tp-b.example", "TP B Iso Admin");
    expect(await getStaffProfile(institutionB, adminB.authUserId, teacherHsId)).toBeNull();
    const criteriaB = await listObservationCriteria(institutionB, adminB.authUserId);
    // B gets its OWN lazily-seeded default rubric, entirely separate rows from A's.
    const criteriaA = await listObservationCriteria(institutionA, adminAuth);
    expect(criteriaB.map((c) => c.id).some((id) => criteriaA.map((c) => c.id).includes(id))).toBe(false);
  });
});
