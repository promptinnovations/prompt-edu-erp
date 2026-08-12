/**
 * PROMPT EDU ERP — Portfolio + Student 360 flow (ARCHITECTURE.md §D.10,
 * §L, Phase 8): unapproved submissions never reach portfolio_events,
 * approval is the single point that writes a timeline row (§L.3), and
 * Student360Service.get() composes existing module data correctly without
 * a new denormalized table (§L.4).
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
  listSkillTypes, listSkillActivities, createSkillSubmission, submitSkillSubmission, reviewSkillSubmission,
} from "../../modules/skills/service";
import {
  listAchievementCategories, listAchievementLevels, submitAchievement, verifyAchievement, approveAchievement,
} from "../../modules/achievements/service";
import { computeConsolidatedScore } from "../../modules/scoring/service";
import { listPortfolioTimeline, getStudent360 } from "../../modules/portfolio/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let managementAuth: string, managementUserId: string;
let classId: string, sectionId: string, subjectId: string;
let student1: string;
let examinationId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "pf-school-a");
  institutionB = await seedDemoInstitution(db, "pf-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@pf-a.example", "Portfolio Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const management = await seedDemoUser(db, institutionA, "mgmt@pf-a.example", "Portfolio Management", "management");
  managementAuth = management.authUserId; managementUserId = management.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 9", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;
  const subject = await createSubject(institutionA, adminAuth, adminUserId, { name: "Science" });
  subjectId = subject.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PF360-1", fullName: "Portfolio Student" });
  student1 = s1.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const dbForEnroll = await getDbClient();
  await dbForEnroll.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    await scoped.query(
      `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
       values ($1, $2, $3, $4, $5)`,
      [institutionA, student1, year.id, classId, sectionId]
    );
  });

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main")!;
  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year.id, name: "Portfolio Test Exam",
  });
  examinationId = examination.id;
  await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);
  const examSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId, maxMarks: 100, passMarks: 35 });
  await enterMarks(institutionA, adminAuth, adminUserId, examSubject.id, [{ studentId: student1, marksObtained: 72, isAbsent: false }]);
  await submitMarks(institutionA, adminAuth, examSubject.id, adminUserId);
  await verifyMarks(institutionA, adminAuth, examSubject.id, adminUserId);
  await approveMarks(institutionA, adminAuth, examSubject.id, adminUserId);
  await computeResults(institutionA, adminAuth, examinationId);

  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  const present = statuses.find((s) => s.code === "present")!.id;
  await markAttendance(institutionA, adminAuth, adminUserId, {
    classId, sectionId, date: "2026-06-10",
    entries: [{ studentId: student1, statusId: present, isLate: false }],
  });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Approval-gated portfolio writes (§L.3)", () => {
  it("a draft/submitted skill submission never appears in the portfolio timeline", async () => {
    const skillTypes = await listSkillTypes(institutionA, adminAuth);
    const readingActivities = await listSkillActivities(institutionA, adminAuth, skillTypes.find((t) => t.code === "reading")!.id);
    const submission = await createSkillSubmission(institutionA, adminAuth, adminUserId, { studentId: student1, skillActivityId: readingActivities[0].id });
    await submitSkillSubmission(institutionA, adminAuth, adminUserId, submission.id);

    const timelineBeforeApproval = await listPortfolioTimeline(institutionA, adminAuth, student1);
    expect(timelineBeforeApproval.some((e) => e.entity_id === submission.id)).toBe(false);

    // Now approve it (this activity's approval_required=false, so 'verified' auto-approves).
    await reviewSkillSubmission(institutionA, adminAuth, adminUserId, submission.id, "verified");
    const timelineAfterApproval = await listPortfolioTimeline(institutionA, adminAuth, student1);
    const event = timelineAfterApproval.find((e) => e.entity_id === submission.id);
    expect(event).toBeTruthy();
    expect(event!.module).toBe("skills");
    expect(event!.event_type).toBe("skill_approved");
    expect(event!.title).toContain("Weekly Reading Log");
  });

  it("a pending achievement never appears in the portfolio timeline until approved", async () => {
    const categories = await listAchievementCategories(institutionA, adminAuth);
    const levels = await listAchievementLevels(institutionA, adminAuth);
    const achievement = await submitAchievement(institutionA, adminAuth, adminUserId, {
      studentId: student1, categoryId: categories[0].id, levelId: levels[0].id, title: "Portfolio Achievement Test", points: 6,
    });

    const timelineBeforeApproval = await listPortfolioTimeline(institutionA, adminAuth, student1);
    expect(timelineBeforeApproval.some((e) => e.entity_id === achievement.id)).toBe(false);

    await verifyAchievement(institutionA, managementAuth, managementUserId, achievement.id);
    const timelineAfterVerify = await listPortfolioTimeline(institutionA, adminAuth, student1);
    expect(timelineAfterVerify.some((e) => e.entity_id === achievement.id)).toBe(false); // verified alone is still not approved

    await approveAchievement(institutionA, managementAuth, managementUserId, achievement.id);
    const timelineAfterApproval = await listPortfolioTimeline(institutionA, adminAuth, student1);
    const event = timelineAfterApproval.find((e) => e.entity_id === achievement.id);
    expect(event).toBeTruthy();
    expect(event!.module).toBe("achievements");
    expect(Number(event!.score)).toBe(6);
  });

  it("a rejected achievement never appears in the portfolio timeline", async () => {
    const categories = await listAchievementCategories(institutionA, adminAuth);
    const levels = await listAchievementLevels(institutionA, adminAuth);
    const achievement = await submitAchievement(institutionA, adminAuth, adminUserId, {
      studentId: student1, categoryId: categories[0].id, levelId: levels[0].id, title: "Rejected claim",
    });
    const { rejectAchievement } = await import("../../modules/achievements/service");
    await rejectAchievement(institutionA, managementAuth, managementUserId, achievement.id);

    const timeline = await listPortfolioTimeline(institutionA, adminAuth, student1);
    expect(timeline.some((e) => e.entity_id === achievement.id)).toBe(false);
  });

  it("the timeline is ordered most-recent-first", async () => {
    const timeline = await listPortfolioTimeline(institutionA, adminAuth, student1);
    expect(timeline.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < timeline.length; i++) {
      const prev = new Date(timeline[i - 1].approved_at).getTime();
      const curr = new Date(timeline[i].approved_at).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});

describe("Student 360° composition (§L.4)", () => {
  it("getStudent360() correctly fans out to enrollment, latest result, attendance, consolidated score, and portfolio timeline", async () => {
    await computeConsolidatedScore(institutionA, adminAuth, student1, "Portfolio Test Period", "2026-01-01", "2026-12-31");

    const profile = await getStudent360(institutionA, adminAuth, student1);

    expect(profile.student?.full_name).toBe("Portfolio Student");
    expect(profile.enrollment?.class_id).toBe(classId);

    expect(profile.latestResult).toBeTruthy();
    expect(profile.latestResult!.examination_name).toBe("Portfolio Test Exam");
    expect(Number(profile.latestResult!.percentage)).toBeCloseTo(72, 5);

    expect(profile.attendanceSummary).toBeTruthy();
    expect(profile.attendanceSummary!.present_days).toBeGreaterThanOrEqual(1);

    expect(profile.latestConsolidatedScore).toBeTruthy();
    expect(profile.latestConsolidatedScore!.period).toBe("Portfolio Test Period");

    expect(profile.recentPortfolioEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("getStudent360() degrades gracefully for a student with no results/attendance/score yet", async () => {
    const bareStudent = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PF360-BARE", fullName: "Bare Student" });
    const profile = await getStudent360(institutionA, adminAuth, bareStudent.id);

    expect(profile.student?.full_name).toBe("Bare Student");
    expect(profile.enrollment).toBeNull();
    expect(profile.latestResult).toBeNull();
    expect(profile.latestConsolidatedScore).toBeNull();
    expect(profile.recentPortfolioEvents).toHaveLength(0);
  });
});

describe("Portfolio tenant isolation (§E, extended to migration 0010)", () => {
  it("Institution B cannot see Institution A's portfolio events, and Student 360 for a cross-institution id returns nulls", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@pf-b.example", "Portfolio B Admin");

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from portfolio_events where student_id = $1", [student1]);
      expect(rows.rows).toHaveLength(0);
    });

    const timelineB = await listPortfolioTimeline(institutionB, adminB.authUserId, student1);
    expect(timelineB).toHaveLength(0);

    // Institution A's student, viewed through Institution B's context — RLS
    // blocks the underlying student row, so the composition degrades to nulls
    // rather than leaking Institution A's data.
    const profileFromB = await getStudent360(institutionB, adminB.authUserId, student1);
    expect(profileFromB.student).toBeNull();
    expect(profileFromB.latestResult).toBeNull();
    expect(profileFromB.recentPortfolioEvents).toHaveLength(0);
  });
});
