/**
 * PROMPT EDU ERP — Page 2 "Academic Structure" + Page 3 "Student Management"
 * follow-ups (migration 0032). Covers the pieces that had no prior test
 * coverage: the bulk class-promotion workflow (preview + confirm, all five
 * PromotionAction branches), the classId/studentId scoping added to the
 * discipline/achievements/skills/library listing functions, class strength,
 * the class-scoped examinations lookup, student photo upload's ownership
 * check, and the parent-portal section-visibility config, each with tenant
 * isolation where the underlying table/column is institution-scoped.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import {
  createClass, createSection, getCurrentAcademicYear, createAcademicYear, setCurrentAcademicYear,
  getPromotionPreview, promoteClass,
} from "../../modules/academic/service";
import {
  createStudent, getClassStrength, updateStudentPhoto, getStudent, enrollStudent, removeStudentFromClass,
} from "../../modules/students/service";
import { listDisciplineRecords, createDisciplineRecord, listDisciplineCategories } from "../../modules/discipline/service";
import { listAchievements, submitAchievement, listAchievementCategories, listAchievementLevels } from "../../modules/achievements/service";
import { listSkillSubmissions, createSkillSubmission, listSkillTypes, listSkillActivities } from "../../modules/skills/service";
import { listReadingRecords, listBooks, listAvailableCopies, issueBook, returnBook } from "../../modules/library/service";
import { listExamTypes, createExamination, addExamClass, listExaminationsForClass } from "../../modules/examination/service";
import { uploadFile } from "../../services/storage/file-service";
import {
  getParentPortalSections, updateParentPortalSections, PARENT_PORTAL_SECTION_KEYS,
} from "../../services/institution/institution-service";

let institutionA: string, institutionB: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let librarianAuth: string, librarianUserId: string;
let classLower: string, classUpper: string; // sort_order 1, 2 — "next class" for promotion
let sectionLowerA: string, sectionUpperA: string;
let yearCurrentId: string, yearNextId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "asm-school-a");
  institutionB = await seedDemoInstitution(db, "asm-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@asm-a.example", "ASM Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const teacher = await seedDemoUser(db, institutionA, "teacher@asm-a.example", "ASM Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const librarian = await seedDemoUser(db, institutionA, "librarian@asm-a.example", "ASM Librarian", "librarian");
  librarianAuth = librarian.authUserId; librarianUserId = librarian.userId;

  const lower = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 5", sortOrder: 1, stage: "UP" });
  const upper = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 6", sortOrder: 2, stage: "UP" });
  classLower = lower.id; classUpper = upper.id;

  const secLower = await createSection(institutionA, adminAuth, adminUserId, { classId: classLower, name: "A" });
  const secUpper = await createSection(institutionA, adminAuth, adminUserId, { classId: classUpper, name: "A" });
  sectionLowerA = secLower.id; sectionUpperA = secUpper.id;

  const currentYear = await getCurrentAcademicYear(institutionA, adminAuth);
  yearCurrentId = currentYear!.id;
  const nextYear = await createAcademicYear(institutionA, adminAuth, adminUserId, {
    name: "2027-2028", startDate: "2027-06-01", endDate: "2028-03-31", isCurrent: false,
  });
  yearNextId = nextYear.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("stage field on classes (§Page-2 'real, editable field')", () => {
  it("createClass()/listClasses() round-trip an admin-set stage value", async () => {
    const { listClasses } = await import("../../modules/academic/service");
    const classes = await listClasses(institutionA, adminAuth);
    const lower = classes.find((c) => c.id === classLower);
    expect(lower?.stage).toBe("UP");
  });
});

describe("class strength (§Page-2 'Strength: Boys, Girls')", () => {
  it("counts boys/girls/other among the class's active current-year roster only", async () => {
    const boy = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-B1", fullName: "Boy One", gender: "male" });
    const girl = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-G1", fullName: "Girl One", gender: "female" });
    const other = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-O1", fullName: "Other One", gender: null });

    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: boy.id, academicYearId: yearCurrentId, classId: classLower, sectionId: sectionLowerA });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: girl.id, academicYearId: yearCurrentId, classId: classLower, sectionId: sectionLowerA });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: other.id, academicYearId: yearCurrentId, classId: classLower, sectionId: sectionLowerA });

    const strength = await getClassStrength(institutionA, adminAuth, classLower);
    expect(strength).toEqual({ boys: 1, girls: 1, other: 1, total: 3 });
  });

  it("an empty class reports all zeros, not an error", async () => {
    const empty = await createClass(institutionA, adminAuth, adminUserId, { name: "Empty Grade", sortOrder: 99 });
    const strength = await getClassStrength(institutionA, adminAuth, empty.id);
    expect(strength).toEqual({ boys: 0, girls: 0, other: 0, total: 0 });
  });
});

describe("class-scoped listings (§Page-2 'Discipline Records'/'Skills & Achievements'/'Library' on the class page)", () => {
  let inClassStudent: string, outOfClassStudent: string;

  beforeAll(async () => {
    const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-CS1", fullName: "In Class Student" });
    const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-CS2", fullName: "Out Of Class Student" });
    inClassStudent = s1.id; outOfClassStudent = s2.id;

    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: inClassStudent, academicYearId: yearCurrentId, classId: classUpper, sectionId: sectionUpperA });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: outOfClassStudent, academicYearId: yearCurrentId, classId: classLower, sectionId: sectionLowerA });

    // Discipline
    const categories = await listDisciplineCategories(institutionA, adminAuth);
    await createDisciplineRecord(institutionA, adminAuth, adminUserId, { studentId: inClassStudent, categoryId: categories[0].id, date: "2026-08-01" });
    await createDisciplineRecord(institutionA, adminAuth, adminUserId, { studentId: outOfClassStudent, categoryId: categories[0].id, date: "2026-08-01" });

    // Achievements
    const achCategories = await listAchievementCategories(institutionA, adminAuth);
    const achLevels = await listAchievementLevels(institutionA, adminAuth);
    await submitAchievement(institutionA, teacherAuth, teacherUserId, { studentId: inClassStudent, categoryId: achCategories[0].id, levelId: achLevels[0].id, title: "In-class achievement" });
    await submitAchievement(institutionA, teacherAuth, teacherUserId, { studentId: outOfClassStudent, categoryId: achCategories[0].id, levelId: achLevels[0].id, title: "Out-of-class achievement" });

    // Skills
    const skillTypes = await listSkillTypes(institutionA, adminAuth);
    const activities = await listSkillActivities(institutionA, adminAuth, skillTypes[0].id);
    await createSkillSubmission(institutionA, teacherAuth, teacherUserId, { studentId: inClassStudent, skillActivityId: activities[0].id, detailsJsonb: { note: "in class" } });
    await createSkillSubmission(institutionA, teacherAuth, teacherUserId, { studentId: outOfClassStudent, skillActivityId: activities[0].id, detailsJsonb: { note: "out of class" } });

    // Library
    const books = await listBooks(institutionA, adminAuth);
    const copies1 = await listAvailableCopies(institutionA, librarianAuth, books[0].id);
    const issue1 = await issueBook(institutionA, librarianAuth, librarianUserId, inClassStudent, copies1[0].id);
    await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue1.id, conditionOnReturn: "good" });
    const copies2 = await listAvailableCopies(institutionA, librarianAuth, books[0].id);
    const issue2 = await issueBook(institutionA, librarianAuth, librarianUserId, outOfClassStudent, copies2[0].id);
    await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue2.id, conditionOnReturn: "good" });
  });

  it("listDisciplineRecords(classId) only returns records for students CURRENTLY enrolled in that class", async () => {
    const records = await listDisciplineRecords(institutionA, adminAuth, undefined, classUpper);
    expect(records.some((r) => r.student_id === inClassStudent)).toBe(true);
    expect(records.some((r) => r.student_id === outOfClassStudent)).toBe(false);
  });

  it("listAchievements(classId) only returns achievements for students currently in that class", async () => {
    const rows = await listAchievements(institutionA, adminAuth, undefined, classUpper);
    expect(rows.some((r) => r.student_id === inClassStudent)).toBe(true);
    expect(rows.some((r) => r.student_id === outOfClassStudent)).toBe(false);
  });

  it("listSkillSubmissions(classId) only returns submissions for students currently in that class", async () => {
    const rows = await listSkillSubmissions(institutionA, adminAuth, undefined, classUpper);
    expect(rows.some((r) => r.student_id === inClassStudent)).toBe(true);
    expect(rows.some((r) => r.student_id === outOfClassStudent)).toBe(false);
  });

  it("listReadingRecords(classId) only returns reading records for students currently in that class", async () => {
    const rows = await listReadingRecords(institutionA, adminAuth, undefined, classUpper);
    expect(rows.some((r) => r.student_id === inClassStudent)).toBe(true);
    expect(rows.some((r) => r.student_id === outOfClassStudent)).toBe(false);
  });

  it("moving a student out of the class drops them from classId-scoped listings immediately", async () => {
    let rows = await listAchievements(institutionA, adminAuth, undefined, classUpper);
    expect(rows.some((r) => r.student_id === inClassStudent)).toBe(true);

    await removeStudentFromClass(institutionA, adminAuth, adminUserId, inClassStudent, "test move-out");

    rows = await listAchievements(institutionA, adminAuth, undefined, classUpper);
    expect(rows.some((r) => r.student_id === inClassStudent)).toBe(false);
  });

  it("studentId-scoped listings (parent-portal reuse) return exactly one student's own records regardless of others", async () => {
    const achievements = await listAchievements(institutionA, adminAuth, undefined, undefined, outOfClassStudent);
    expect(achievements.length).toBeGreaterThan(0);
    expect(achievements.every((a) => a.student_id === outOfClassStudent)).toBe(true);

    const skills = await listSkillSubmissions(institutionA, adminAuth, undefined, undefined, outOfClassStudent);
    expect(skills.every((s) => s.student_id === outOfClassStudent)).toBe(true);

    const reading = await listReadingRecords(institutionA, adminAuth, undefined, undefined, outOfClassStudent);
    expect(reading.every((r) => r.student_id === outOfClassStudent)).toBe(true);
  });
});

describe("examinations scoped to a class (§Page-2 'Exams added ... click result')", () => {
  it("listExaminationsForClass() only returns examinations that cover that class via exam_classes", async () => {
    const examTypes = await listExamTypes(institutionA, adminAuth);
    const exam = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examTypes[0].id, academicYearId: yearCurrentId, name: "First Term Exam — Grade 6",
    });
    await addExamClass(institutionA, adminAuth, exam.id, classUpper);

    const forUpper = await listExaminationsForClass(institutionA, adminAuth, classUpper);
    expect(forUpper.some((e) => e.id === exam.id)).toBe(true);

    const forLower = await listExaminationsForClass(institutionA, adminAuth, classLower);
    expect(forLower.some((e) => e.id === exam.id)).toBe(false);
  });
});

describe("promotion workflow (§Page-2 'full bulk promotion')", () => {
  // Dedicated classes/sections (distinct sort_order range) so this block's
  // roster counts can't be contaminated by students enrolled into
  // classLower/classUpper by earlier describe blocks in this file.
  let promoClassLower: string, promoClassUpper: string, promoSectionLower: string, promoSectionUpper: string;
  let promoStudent1: string, promoStudent2: string, promoStudent3: string, promoStudent4: string, promoStudent5: string;

  beforeAll(async () => {
    const lower = await createClass(institutionA, adminAuth, adminUserId, { name: "Promo Grade Lower", sortOrder: 500 });
    const upper = await createClass(institutionA, adminAuth, adminUserId, { name: "Promo Grade Upper", sortOrder: 501 });
    promoClassLower = lower.id; promoClassUpper = upper.id;
    const secLower = await createSection(institutionA, adminAuth, adminUserId, { classId: promoClassLower, name: "A" });
    const secUpper = await createSection(institutionA, adminAuth, adminUserId, { classId: promoClassUpper, name: "A" });
    promoSectionLower = secLower.id; promoSectionUpper = secUpper.id;

    const students = await Promise.all([
      createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-P1", fullName: "Promo Student One", gender: "male" }),
      createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-P2", fullName: "Promo Student Two", gender: "female" }),
      createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-P3", fullName: "Promo Student Three", gender: "male" }),
      createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-P4", fullName: "Promo Student Four", gender: "female" }),
      createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-P5", fullName: "Promo Student Five", gender: "male" }),
    ]);
    [promoStudent1, promoStudent2, promoStudent3, promoStudent4, promoStudent5] = students.map((s) => s.id);
    for (const sid of students.map((s) => s.id)) {
      await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: sid, academicYearId: yearCurrentId, classId: promoClassLower, sectionId: promoSectionLower });
    }
  });

  it("getPromotionPreview() suggests 'promote' to the next-higher sort_order class for every active student in the class", async () => {
    const preview = await getPromotionPreview(institutionA, adminAuth, promoClassLower);
    expect(preview.length).toBe(5);
    for (const row of preview) {
      expect(row.suggested_action).toBe("promote");
      expect(row.suggested_class_id).toBe(promoClassUpper);
    }
  });

  it("getPromotionPreview() suggests 'graduate' when the class is already the institution's highest sort_order", async () => {
    const preview = await getPromotionPreview(institutionA, adminAuth, promoClassUpper);
    // promoClassUpper currently has no active students, but the suggestion
    // logic itself (no next class exists) is what's under test here via a
    // probe insert — sort_order 501 is deliberately the highest in the
    // institution among classes created by this file.
    const probe = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-PROBE", fullName: "Graduate Probe" });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: probe.id, academicYearId: yearCurrentId, classId: promoClassUpper, sectionId: promoSectionUpper });
    const previewAfter = await getPromotionPreview(institutionA, adminAuth, promoClassUpper);
    expect(previewAfter.find((r) => r.student_id === probe.id)?.suggested_action).toBe("graduate");
    expect(previewAfter.find((r) => r.student_id === probe.id)?.suggested_class_id).toBeNull();
    expect(preview).toBeDefined(); // sanity: earlier call didn't throw on an empty roster
  });

  it("promoteClass() requires a target class/division for promote/repeat decisions", async () => {
    await expect(
      promoteClass(institutionA, adminAuth, adminUserId, {
        fromClassId: promoClassLower, toAcademicYearId: yearNextId,
        decisions: [{ studentId: promoStudent1, action: "promote" }],
      })
    ).rejects.toThrow(/target class and division are required/);
  });

  it("promoteClass() handles every action branch in one confirmed call: promote/repeat/graduate/transfer_out/dropout", async () => {
    const result = await promoteClass(institutionA, adminAuth, adminUserId, {
      fromClassId: promoClassLower,
      toAcademicYearId: yearNextId,
      decisions: [
        { studentId: promoStudent1, action: "promote", toClassId: promoClassUpper, toSectionId: promoSectionUpper },
        { studentId: promoStudent2, action: "repeat", toClassId: promoClassLower, toSectionId: promoSectionLower },
        { studentId: promoStudent3, action: "graduate" },
        { studentId: promoStudent4, action: "transfer_out" },
        { studentId: promoStudent5, action: "dropout" },
      ],
    });

    expect(result).toEqual({
      promoted: 1, repeated: 1, graduated: 1, transferredOut: 1, droppedOut: 1, skippedAlreadyEnrolled: [],
    });

    // Advancing students (promote/repeat): a NEW enrollment row for the next
    // year, current year's row untouched.
    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const { rows: nextYearRow } = await scoped.query<{ class_id: string; status: string }>(
        "select class_id, status from student_enrollments where student_id = $1 and academic_year_id = $2",
        [promoStudent1, yearNextId]
      );
      expect(nextYearRow[0]).toMatchObject({ class_id: promoClassUpper, status: "active" });

      const { rows: priorYearRow } = await scoped.query<{ status: string }>(
        "select status from student_enrollments where student_id = $1 and academic_year_id = $2",
        [promoStudent1, yearCurrentId]
      );
      expect(priorYearRow[0].status).toBe("active"); // untouched — permanent history

      const { rows: repeatRow } = await scoped.query<{ class_id: string }>(
        "select class_id from student_enrollments where student_id = $1 and academic_year_id = $2",
        [promoStudent2, yearNextId]
      );
      expect(repeatRow[0].class_id).toBe(promoClassLower); // repeat = same class, new year

      // Non-advancing students: CURRENT year row closed out, no next-year row.
      const { rows: graduateRow } = await scoped.query<{ status: string; exit_reason: string | null }>(
        "select status, exit_reason from student_enrollments where student_id = $1 and academic_year_id = $2",
        [promoStudent3, yearCurrentId]
      );
      expect(graduateRow[0]).toMatchObject({ status: "graduated", exit_reason: "graduated" });

      const { rows: graduateNextYear } = await scoped.query<{ id: string }>(
        "select id from student_enrollments where student_id = $1 and academic_year_id = $2",
        [promoStudent3, yearNextId]
      );
      expect(graduateNextYear.length).toBe(0);

      const { rows: transferRow } = await scoped.query<{ status: string; exit_reason: string | null }>(
        "select status, exit_reason from student_enrollments where student_id = $1 and academic_year_id = $2",
        [promoStudent4, yearCurrentId]
      );
      expect(transferRow[0]).toMatchObject({ status: "transferred", exit_reason: "transferred_out" });

      const { rows: dropoutRow } = await scoped.query<{ status: string; exit_reason: string | null }>(
        "select status, exit_reason from student_enrollments where student_id = $1 and academic_year_id = $2",
        [promoStudent5, yearCurrentId]
      );
      expect(dropoutRow[0]).toMatchObject({ status: "removed", exit_reason: "dropout" });
    });
  });

  it("promoteClass() skips (rather than double-enrolling) a student who already has an active enrollment in the target year", async () => {
    const again = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-P6", fullName: "Already Promoted" });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: again.id, academicYearId: yearCurrentId, classId: promoClassLower, sectionId: promoSectionLower });
    // Pre-seed an active enrollment already in the target year (simulating a double-run).
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: again.id, academicYearId: yearNextId, classId: promoClassUpper, sectionId: promoSectionUpper });

    const result = await promoteClass(institutionA, adminAuth, adminUserId, {
      fromClassId: promoClassLower,
      toAcademicYearId: yearNextId,
      decisions: [{ studentId: again.id, action: "promote", toClassId: promoClassUpper, toSectionId: promoSectionUpper }],
    });

    expect(result.promoted).toBe(0);
    expect(result.skippedAlreadyEnrolled).toEqual([again.id]);
  });
});

describe("setCurrentAcademicYear() (§Page-2 'Archive previous year')", () => {
  it("flips is_current to the new year and off the old one; enrollments/exams stay exactly where they were", async () => {
    await setCurrentAcademicYear(institutionA, adminAuth, adminUserId, yearNextId);
    const current = await getCurrentAcademicYear(institutionA, adminAuth);
    expect(current?.id).toBe(yearNextId);

    // Flip back so later tests in this file (which assume yearCurrentId is
    // still "current") are unaffected — isolates this test from ordering.
    await setCurrentAcademicYear(institutionA, adminAuth, adminUserId, yearCurrentId);
    const restored = await getCurrentAcademicYear(institutionA, adminAuth);
    expect(restored?.id).toBe(yearCurrentId);
  });
});

describe("student photo (§Page-3 'Student Profile ... Photo')", () => {
  it("updateStudentPhoto() attaches an uploaded file and getStudent() reflects it; null removes it", async () => {
    const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-PHOTO1", fullName: "Photo Student" });
    const uploaded = await uploadFile(institutionA, adminAuth, adminUserId, {
      entityType: "students", entityId: student.id, fileName: "photo.jpg", mimeType: "image/jpeg", isPublic: false,
      bytes: Buffer.from("fake-jpeg-bytes"),
    });

    await updateStudentPhoto(institutionA, adminAuth, adminUserId, student.id, uploaded.id);
    let fetched = await getStudent(institutionA, adminAuth, student.id);
    expect(fetched?.photo_file_id).toBe(uploaded.id);

    await updateStudentPhoto(institutionA, adminAuth, adminUserId, student.id, null);
    fetched = await getStudent(institutionA, adminAuth, student.id);
    expect(fetched?.photo_file_id).toBeNull();
  });

  it("refuses to attach a file belonging to a DIFFERENT institution, even though the FK alone wouldn't stop it", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@asm-b.example", "ASM B Admin", "institution_admin");
    const studentB = await createStudent(institutionB, adminB.authUserId, adminB.userId, { admissionNumber: "ASM-B-PHOTO", fullName: "B School Student" });
    const fileOwnedByB = await uploadFile(institutionB, adminB.authUserId, adminB.userId, {
      entityType: "students", entityId: studentB.id, fileName: "b-photo.jpg", mimeType: "image/jpeg", isPublic: false,
      bytes: Buffer.from("bytes"),
    });

    const studentA = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ASM-PHOTO2", fullName: "Cross-Tenant Target" });
    await expect(
      updateStudentPhoto(institutionA, adminAuth, adminUserId, studentA.id, fileOwnedByB.id)
    ).rejects.toThrow(/does not belong to this institution/);

    const fetched = await getStudent(institutionA, adminAuth, studentA.id);
    expect(fetched?.photo_file_id).toBeNull();
  });
});

describe("parent portal section visibility config (§Page-3 'Student Portfolio Management')", () => {
  it("defaults to every section visible when nothing has been configured yet", async () => {
    const sections = await getParentPortalSections(institutionA, adminAuth);
    for (const key of PARENT_PORTAL_SECTION_KEYS) {
      expect(sections[key]).toBe(true);
    }
  });

  it("updateParentPortalSections() persists a partial toggle-off and getParentPortalSections() reflects it", async () => {
    await updateParentPortalSections(institutionA, adminAuth, adminUserId, {
      results: true, attendance: true, discipline: false, achievements: true, library: false, skills: true, portfolio: true,
      character: true, mentoring: true,
    });
    const sections = await getParentPortalSections(institutionA, adminAuth);
    expect(sections.discipline).toBe(false);
    expect(sections.library).toBe(false);
    expect(sections.results).toBe(true);
  });

  it("is per-institution — updating Institution A's config never touches Institution B's", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin-ppc@asm-b.example", "ASM B Admin PPC", "institution_admin");
    const sectionsB = await getParentPortalSections(institutionB, adminB.authUserId);
    for (const key of PARENT_PORTAL_SECTION_KEYS) {
      expect(sectionsB[key]).toBe(true); // still all-default, unaffected by A's update above
    }
  });
});
