/**
 * PROMPT EDU ERP — Analytics module flow (ARCHITECTURE.md §N, Phase 5):
 * approve marks -> compute results -> refresh materialized views -> verify
 * subject stats/comparison and student classification match a manual
 * calculation, mark attendance across months -> verify the attendance
 * trend rollup, and confirm AnalyticsService's explicit institutionId
 * filtering keeps Institution B from ever seeing Institution A's rows in
 * the (RLS-less, §N migration note) materialized views.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, computeResults,
} from "../../modules/examination/service";
import { listAttendanceStatuses, markAttendance } from "../../modules/attendance/service";
import {
  refreshAnalyticsViews, getExamSubjectStats, getSubjectComparison,
  getExaminationClassification, getClassificationRule, upsertClassificationRule,
  getClassAttendanceTrend,
} from "../../modules/analytics/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let classId: string, sectionId: string, mathId: string, scienceId: string;
let student1: string, student2: string, student3: string;
let examinationId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "an-school-a");
  institutionB = await seedDemoInstitution(db, "an-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@an-a.example", "Analytics Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 7", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;
  const math = await createSubject(institutionA, adminAuth, adminUserId, { name: "Mathematics" });
  mathId = math.id;
  const science = await createSubject(institutionA, adminAuth, adminUserId, { name: "Science" });
  scienceId = science.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "AN-1", fullName: "Alpha Student" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "AN-2", fullName: "Beta Student" });
  const s3 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "AN-3", fullName: "Gamma Student" });
  student1 = s1.id; student2 = s2.id; student3 = s3.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const dbForEnroll = await getDbClient();
  await dbForEnroll.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    for (const sid of [student1, student2, student3]) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
         values ($1, $2, $3, $4, $5)`,
        [institutionA, sid, year.id, classId, sectionId]
      );
    }
  });

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main")!;
  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year.id, name: "Term 1 Exam",
  });
  examinationId = examination.id;
  await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);

  const mathSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: mathId, maxMarks: 100, passMarks: 35 });
  const scienceSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: scienceId, maxMarks: 100, passMarks: 35 });

  // student1: 90/85 (high), student2: 60/55 (middle), student3: 20/30 (low, fails both)
  for (const es of [mathSubject, scienceSubject]) {
    const marks = es.id === mathSubject.id
      ? [{ studentId: student1, marksObtained: 90, isAbsent: false }, { studentId: student2, marksObtained: 60, isAbsent: false }, { studentId: student3, marksObtained: 20, isAbsent: false }]
      : [{ studentId: student1, marksObtained: 85, isAbsent: false }, { studentId: student2, marksObtained: 55, isAbsent: false }, { studentId: student3, marksObtained: 30, isAbsent: false }];
    await enterMarks(institutionA, adminAuth, adminUserId, es.id, marks);
    await submitMarks(institutionA, adminAuth, es.id, adminUserId);
    await verifyMarks(institutionA, adminAuth, es.id, adminUserId);
    await approveMarks(institutionA, adminAuth, es.id, adminUserId);
  }
  await computeResults(institutionA, adminAuth, examinationId);

  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  const present = statuses.find((s) => s.code === "present")!.id;
  const late = statuses.find((s) => s.code === "late")!.id;
  await markAttendance(institutionA, adminAuth, adminUserId, {
    classId, sectionId, date: "2026-04-05",
    entries: [{ studentId: student1, statusId: present, isLate: false }, { studentId: student2, statusId: late, isLate: true, lateMinutes: 5 }],
  });
  await markAttendance(institutionA, adminAuth, adminUserId, {
    classId, sectionId, date: "2026-05-05",
    entries: [{ studentId: student1, statusId: present, isLate: false }, { studentId: student2, statusId: present, isLate: false }],
  });

  await refreshAnalyticsViews();
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Analytics (§N)", () => {
  it("mv_exam_subject_stats correctly averages approved marks per subject/section", async () => {
    const stats = await getExamSubjectStats(institutionA, adminAuth, examinationId);
    const mathStats = stats.find((s) => s.subject_id === mathId)!;
    expect(mathStats.marked_count).toBe(3);
    expect(Number(mathStats.avg_marks)).toBeCloseTo((90 + 60 + 20) / 3, 5);
    expect(mathStats.pass_count).toBe(2); // 90 and 60 pass (>=35), 20 fails
  });

  it("getSubjectComparison() aggregates across sections per subject", async () => {
    const comparison = await getSubjectComparison(institutionA, adminAuth, examinationId);
    expect(comparison).toHaveLength(2);
    const math = comparison.find((c) => c.subject_id === mathId)!;
    // getSubjectComparison() rounds to 2 decimal places for display (§N.1 UI-facing values).
    expect(Number(math.avg_marks)).toBeCloseTo((90 + 60 + 20) / 3, 1);
    expect(Number(math.pass_percentage)).toBeCloseTo((2 / 3) * 100, 1);
  });

  it("no threshold is hard-coded — the seeded classification_rules row drives every classification", async () => {
    const rule = await getClassificationRule(institutionA, adminAuth);
    expect(rule).toBeTruthy();
    expect(rule!.high_threshold).toBe(75);
    expect(rule!.low_threshold).toBe(40);
  });

  it("getExaminationClassification() correctly bands students against the institution's rule", async () => {
    const classification = await getExaminationClassification(institutionA, adminAuth, examinationId);
    expect(classification).toHaveLength(3);
    expect(classification.find((c) => c.student_id === student1)?.band).toBe("high_achiever"); // 87.5%
    expect(classification.find((c) => c.student_id === student2)?.band).toBe("middle_achiever"); // 57.5%
    expect(classification.find((c) => c.student_id === student3)?.band).toBe("low_achiever"); // 25%
  });

  it("upsertClassificationRule() changes thresholds and reclassification reflects it immediately", async () => {
    await upsertClassificationRule(institutionA, adminAuth, { basedOn: "percentage", highThreshold: 90, lowThreshold: 60 });
    const classification = await getExaminationClassification(institutionA, adminAuth, examinationId);
    // student2 was 57.5% -> now below the new low_threshold of 60
    expect(classification.find((c) => c.student_id === student2)?.band).toBe("low_achiever");
    // student1 was 87.5% -> now below the new high_threshold of 90, so middle
    expect(classification.find((c) => c.student_id === student1)?.band).toBe("middle_achiever");

    // restore for any later tests/readers of this suite
    await upsertClassificationRule(institutionA, adminAuth, { basedOn: "percentage", highThreshold: 75, lowThreshold: 40 });
  });

  it("mv_attendance_monthly correctly rolls up present/late days per month", async () => {
    const trend = await getClassAttendanceTrend(institutionA, adminAuth, classId, sectionId, "2026-04", "2026-05");
    expect(trend).toHaveLength(2);
    const april = trend.find((t) => t.month.startsWith("2026-04"))!;
    expect(april.total_days).toBe(2); // student1 + student2 marked on 2026-04-05
    expect(april.present_days).toBe(2); // both 'present' and 'late' count_as_present=true
    expect(april.late_days).toBe(1);
  });
});

describe("Analytics tenant isolation (§N migration note — matviews have no RLS, service-layer filtering is the only gate)", () => {
  it("Institution B's AnalyticsService calls never return Institution A's rows even though the underlying matviews are unpartitioned by RLS", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@an-b.example", "Analytics B Admin");

    const statsB = await getExamSubjectStats(institutionB, adminB.authUserId, examinationId);
    expect(statsB).toHaveLength(0);

    const comparisonB = await getSubjectComparison(institutionB, adminB.authUserId, examinationId);
    expect(comparisonB).toHaveLength(0);

    const classificationB = await getExaminationClassification(institutionB, adminB.authUserId, examinationId);
    expect(classificationB).toHaveLength(0);

    const trendB = await getClassAttendanceTrend(institutionB, adminB.authUserId, classId, sectionId, "2026-04", "2026-05");
    expect(trendB).toHaveLength(0);
  });
});
