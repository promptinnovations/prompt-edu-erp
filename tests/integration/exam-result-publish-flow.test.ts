/**
 * PROMPT EDU ERP — exam result "publish to portal" gate (migration 0057).
 *
 * §"result should not wait for finalization, it should be visible once
 * enter the marks, save, submit. remove finalization button — the
 * admin/principal should publish result of an exam for viewing it in
 * student/parent portal. grade should be generated automatically while
 * entering marks."
 *
 * This covers two things:
 *   1. A regression guard that live results/grade computation (built in an
 *      earlier round, migration 0054) is unaffected by this change: a
 *      DRAFT mark (never submitted/verified/approved) already produces a
 *      computed, non-provisional-once-complete result with a grade —
 *      there is no "finalize" or "publish" step standing between entering
 *      a mark and it being computed.
 *   2. The actual new behaviour: publishExamination()/unpublishExamination()
 *      toggle examinations.published_at, and ONLY the portal-facing reads
 *      (listStudentResultHistory(), getStudent360() with
 *      onlyPublishedResults=true) respect it — a staff-facing read
 *      (getStudent360() with the default false) sees the same live result
 *      whether or not the exam has ever been published.
 */
import { beforeAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  enterMarksAndRecompute, getResults, listStudentResultHistory,
  publishExamination, unpublishExamination, getExamination,
  submitMarks, verifyMarks, approveMarks, lockMarks,
} from "../../modules/examination/service";
import { getStudent360 } from "../../modules/portfolio/service";

let inst: string;
let adminAuth: string, adminUserId: string;
let classId: string, sectionId: string;
let mathId: string;
let s1: string;
let yearId: string;
let examTypeId: string;
let examinationId: string;
let examSubjectId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "publish-a");
  const admin = await seedDemoUser(db, inst, "admin@publish-a.example", "Publish Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  classId = (await createClass(inst, adminAuth, adminUserId, { name: "PB Grade 8", sortOrder: 1 })).id;
  sectionId = (await createSection(inst, adminAuth, adminUserId, { classId, name: "A" })).id;
  mathId = (await createSubject(inst, adminAuth, adminUserId, { name: "PB Maths" })).id;
  s1 = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "PB-1", fullName: "PB One" })).id;

  const year = await getCurrentAcademicYear(inst, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");
  yearId = year.id;

  await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
    await scoped.query(
      `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
      [inst, s1, yearId, classId, sectionId]
    );
  });

  const examTypes = await listExamTypes(inst, adminAuth);
  examTypeId = examTypes.find((t) => !t.is_daily_assessment)!.id;

  const exam = await createExamination(inst, adminAuth, adminUserId, { examTypeId, academicYearId: yearId, name: "PB Term Exam" });
  examinationId = exam.id;
  await addExamClass(inst, adminAuth, examinationId, classId, sectionId);
  const es = await addExamSubject(inst, adminAuth, adminUserId, { examinationId, subjectId: mathId, maxMarks: 100, passMarks: 35 });
  examSubjectId = es.id;

  // §"grade should be generated automatically while entering marks" — a
  // plain draft save, nothing submitted/verified/approved/locked.
  await enterMarksAndRecompute(inst, adminAuth, adminUserId, es.id, [{ studentId: s1, marksObtained: 90, isAbsent: false }]);
});

describe("live results/grade at mark entry (regression guard, unaffected by publish gate)", () => {
  it("computes a result with a grade the moment a draft mark is saved — no finalize/publish step required", async () => {
    const results = await getResults(inst, adminAuth, examinationId);
    const mine = results.find((r) => r.student_id === s1);
    expect(mine).toBeTruthy();
    expect(Number(mine!.percentage)).toBe(90);
    expect(mine!.grade_label).toBeTruthy();
  });
});

describe("publish/unpublish gate (portal visibility only)", () => {
  it("moves the mark to approved/locked first — the portal-facing reads " +
    "(unlike the live staff-facing getResults()) only ever surface a " +
    "non-provisional result, same as before this change; the publish gate " +
    "is an independent, additional condition on top of that", async () => {
    await submitMarks(inst, adminAuth, examSubjectId, adminUserId);
    await verifyMarks(inst, adminAuth, examSubjectId, adminUserId);
    await approveMarks(inst, adminAuth, examSubjectId, adminUserId);
    await lockMarks(inst, adminAuth, examSubjectId, adminUserId);
    const results = await getResults(inst, adminAuth, examinationId);
    expect(results.find((r) => r.student_id === s1)?.is_provisional).toBe(false);
  });

  it("starts unpublished", async () => {
    const exam = await getExamination(inst, adminAuth, examinationId);
    expect(exam!.published_at).toBeNull();
  });

  it("listStudentResultHistory (portal) excludes an unpublished exam's result", async () => {
    const history = await listStudentResultHistory(inst, adminAuth, s1);
    expect(history.find((r) => r.examination_id === examinationId)).toBeUndefined();
  });

  it("getStudent360 with onlyPublishedResults=true (portal) sees no latest result yet", async () => {
    const summary = await getStudent360(inst, adminAuth, s1, 10, undefined, true);
    expect(summary.latestResult).toBeNull();
  });

  it("getStudent360 with the default (staff-facing) sees the live result regardless", async () => {
    const summary = await getStudent360(inst, adminAuth, s1);
    expect(summary.latestResult).toBeTruthy();
    expect(summary.latestResult!.examination_name).toBe("PB Term Exam");
  });

  it("publishExamination() stamps published_at/published_by and unlocks the portal reads", async () => {
    await publishExamination(inst, adminAuth, adminUserId, examinationId);
    const exam = await getExamination(inst, adminAuth, examinationId);
    expect(exam!.published_at).toBeTruthy();

    const history = await listStudentResultHistory(inst, adminAuth, s1);
    expect(history.find((r) => r.examination_id === examinationId)).toBeTruthy();

    const summary = await getStudent360(inst, adminAuth, s1, 10, undefined, true);
    expect(summary.latestResult).toBeTruthy();
    expect(summary.latestResult!.examination_name).toBe("PB Term Exam");
  });

  it("unpublishExamination() reverses it without touching the underlying result", async () => {
    await unpublishExamination(inst, adminAuth, adminUserId, examinationId);
    const exam = await getExamination(inst, adminAuth, examinationId);
    expect(exam!.published_at).toBeNull();

    const history = await listStudentResultHistory(inst, adminAuth, s1);
    expect(history.find((r) => r.examination_id === examinationId)).toBeUndefined();

    // The result itself (the staff-facing source of truth) is untouched.
    const results = await getResults(inst, adminAuth, examinationId);
    expect(results.find((r) => r.student_id === s1)?.grade_label).toBeTruthy();
  });

  it("can be published again after unpublishing (unlike a finalize/freeze)", async () => {
    await publishExamination(inst, adminAuth, adminUserId, examinationId);
    const exam = await getExamination(inst, adminAuth, examinationId);
    expect(exam!.published_at).toBeTruthy();
  });
});
