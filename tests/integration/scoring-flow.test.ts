/**
 * PROMPT EDU ERP — Scoring engine + consolidated performance flow
 * (ARCHITECTURE.md §D.9, §K, §K.5, Phase 7): the generic condition
 * matcher/bonus formula/max_points cap in isolation, approving a skill
 * submission or achievement auto-writing a score_event through the real
 * workflow (not a synthetic call), and ConsolidatedScoreService.compute()
 * producing a weighted roll-up that matches a manual calculation.
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
import {
  createScoringRule, evaluateScoring, listScoreEvents, computeConsolidatedScore, getNormalizedScore,
} from "../../modules/scoring/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let managementAuth: string, managementUserId: string;
let classId: string, sectionId: string, subjectId: string;
let student1: string;
let examinationId: string;

const FROM_DATE = "2026-01-01";
const TO_DATE = "2026-12-31";

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "score-school-a");
  institutionB = await seedDemoInstitution(db, "score-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@score-a.example", "Scoring Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const management = await seedDemoUser(db, institutionA, "mgmt@score-a.example", "Scoring Management", "management");
  managementAuth = management.authUserId; managementUserId = management.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 8", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;
  const subject = await createSubject(institutionA, adminAuth, adminUserId, { name: "Mathematics" });
  subjectId = subject.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "SC-1", fullName: "Score Student" });
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

  // Academic: one examination, one subject, 80% result.
  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main")!;
  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year.id, name: "Score Test Exam",
  });
  examinationId = examination.id;
  await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);
  const examSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId, maxMarks: 100, passMarks: 35 });
  await enterMarks(institutionA, adminAuth, adminUserId, examSubject.id, [{ studentId: student1, marksObtained: 80, isAbsent: false }]);
  await submitMarks(institutionA, adminAuth, examSubject.id, adminUserId);
  await verifyMarks(institutionA, adminAuth, examSubject.id, adminUserId);
  await approveMarks(institutionA, adminAuth, examSubject.id, adminUserId);
  await computeResults(institutionA, adminAuth, examinationId);

  // Attendance: 4 of 5 days present -> 80%.
  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  const present = statuses.find((s) => s.code === "present")!.id;
  const absent = statuses.find((s) => s.code === "absent")!.id;
  const dates = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"];
  for (let i = 0; i < dates.length; i++) {
    await markAttendance(institutionA, adminAuth, adminUserId, {
      classId, sectionId, date: dates[i],
      entries: [{ studentId: student1, statusId: i < 4 ? present : absent, isLate: false }],
    });
  }

  // Skills: approve the seeded "Weekly Reading Log" submission (approval_required=false,
  // matching scoring rule awards 3 flat points).
  const skillTypes = await listSkillTypes(institutionA, adminAuth);
  const readingActivities = await listSkillActivities(institutionA, adminAuth, skillTypes.find((t) => t.code === "reading")!.id);
  const submission = await createSkillSubmission(institutionA, adminAuth, adminUserId, { studentId: student1, skillActivityId: readingActivities[0].id });
  await submitSkillSubmission(institutionA, adminAuth, adminUserId, submission.id);
  await reviewSkillSubmission(institutionA, adminAuth, adminUserId, submission.id, "verified");

  // Achievements: submit + verify + approve with points=8.
  const categories = await listAchievementCategories(institutionA, adminAuth);
  const levels = await listAchievementLevels(institutionA, adminAuth);
  const achievement = await submitAchievement(institutionA, adminAuth, adminUserId, {
    studentId: student1, categoryId: categories[0].id, levelId: levels[0].id, title: "Quiz winner", points: 8,
  });
  await verifyAchievement(institutionA, managementAuth, managementUserId, achievement.id);
  await approveAchievement(institutionA, managementAuth, managementUserId, achievement.id);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Scoring evaluator (§K.2/K.3)", () => {
  it("matches min_/max_ threshold conditions and applies the bonus formula, capped at max_points", async () => {
    await createScoringRule(institutionA, adminAuth, adminUserId, {
      module: "writing", activityCode: "nonfiction_article",
      conditionJsonb: { min_pages: 4, type: "non_fiction" },
      points: 5,
      bonusJsonb: { per_extra_unit: 2, unit: "pages", bonus_points: 1 },
      maxPoints: 8,
      verificationRequired: true, approvalRequired: false,
    });

    // Below threshold -> no match.
    const noMatch = await evaluateScoring(institutionA, adminAuth, "writing", "nonfiction_article", { pages: 3, type: "non_fiction" });
    expect(noMatch.rule).toBeNull();
    expect(noMatch.points).toBe(0);

    // Wrong equality field -> no match.
    const wrongType = await evaluateScoring(institutionA, adminAuth, "writing", "nonfiction_article", { pages: 6, type: "fiction" });
    expect(wrongType.rule).toBeNull();

    // At threshold, no extra pages -> base points only.
    const atThreshold = await evaluateScoring(institutionA, adminAuth, "writing", "nonfiction_article", { pages: 4, type: "non_fiction" });
    expect(atThreshold.points).toBe(5);

    // 4 extra pages / 2 per unit = 2 bonus units * 1 point = +2 -> 7.
    const withBonus = await evaluateScoring(institutionA, adminAuth, "writing", "nonfiction_article", { pages: 8, type: "non_fiction" });
    expect(withBonus.points).toBe(7);

    // Way over -> capped at max_points (8), not the uncapped 5 + 5*1=10.
    const capped = await evaluateScoring(institutionA, adminAuth, "writing", "nonfiction_article", { pages: 20, type: "non_fiction" });
    expect(capped.points).toBe(8);
  });

  it("an activity_code with no active rule evaluates to zero points, not an error", async () => {
    const result = await evaluateScoring(institutionA, adminAuth, "writing", "no_such_activity", {});
    expect(result.rule).toBeNull();
    expect(result.points).toBe(0);
  });
});

describe("Score events written through the real approval workflows (§K.3 step 6)", () => {
  it("approving the seeded skill submission auto-wrote a score_event via the seeded scoring_rules row", async () => {
    const events = await listScoreEvents(institutionA, adminAuth, student1);
    const skillEvent = events.find((e) => e.source_module === "skills");
    expect(skillEvent).toBeTruthy();
    expect(Number(skillEvent!.points)).toBe(3); // seeded 'weekly_reading_log' flat rule
    expect(skillEvent!.scoring_rule_id).not.toBeNull();
  });

  it("approving the achievement wrote a score_event carrying its own points, with no scoring_rule_id", async () => {
    const events = await listScoreEvents(institutionA, adminAuth, student1);
    const achievementEvent = events.find((e) => e.source_module === "achievements");
    expect(achievementEvent).toBeTruthy();
    expect(Number(achievementEvent!.points)).toBe(8);
    expect(achievementEvent!.scoring_rule_id).toBeNull();
  });
});

describe("Normalized per-component scores + consolidated roll-up (§K.5)", () => {
  it("getNormalizedScore() returns the expected 0-100 value per component module", async () => {
    const academic = await getNormalizedScore(institutionA, adminAuth, "academic", student1, FROM_DATE, TO_DATE);
    expect(academic).toBeCloseTo(80, 5);

    const attendance = await getNormalizedScore(institutionA, adminAuth, "attendance", student1, FROM_DATE, TO_DATE);
    expect(attendance).toBeCloseTo(80, 5);

    const skills = await getNormalizedScore(institutionA, adminAuth, "skills", student1, FROM_DATE, TO_DATE);
    expect(skills).toBeCloseTo(3, 5);

    const achievements = await getNormalizedScore(institutionA, adminAuth, "achievements", student1, FROM_DATE, TO_DATE);
    expect(achievements).toBeCloseTo(8, 5);

    const unknownComponent = await getNormalizedScore(institutionA, adminAuth, "character", student1, FROM_DATE, TO_DATE);
    expect(unknownComponent).toBe(0);
  });

  it("computeConsolidatedScore() matches a manual weighted-sum calculation against the seeded profile (60/15/15/10)", async () => {
    const result = await computeConsolidatedScore(institutionA, adminAuth, student1, "2026 Test Period", FROM_DATE, TO_DATE);
    expect(result).toBeTruthy();

    const expectedScore = 80 * 0.6 + 80 * 0.15 + 3 * 0.15 + 8 * 0.1;
    expect(Number(result!.score)).toBeCloseTo(expectedScore, 1);
    expect(result!.breakdown_jsonb.academic).toBeCloseTo(80, 5);
    expect(result!.breakdown_jsonb.attendance).toBeCloseTo(80, 5);
    expect(result!.breakdown_jsonb.skills).toBeCloseTo(3, 5);
    expect(result!.breakdown_jsonb.achievements).toBeCloseTo(8, 5);
  });

  it("recomputing for the same student/profile/period upserts rather than duplicating", async () => {
    const first = await computeConsolidatedScore(institutionA, adminAuth, student1, "2026 Test Period", FROM_DATE, TO_DATE);
    const second = await computeConsolidatedScore(institutionA, adminAuth, student1, "2026 Test Period", FROM_DATE, TO_DATE);
    expect(second!.id).toBe(first!.id);
  });
});

describe("Scoring module tenant isolation (§E, extended to migration 0009 tables)", () => {
  it("Institution B cannot see Institution A's scoring rules, score events, or consolidated scores", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@score-b.example", "Scoring B Admin");

    const eventsB = await listScoreEvents(institutionB, adminB.authUserId, student1);
    expect(eventsB).toHaveLength(0);

    // Institution B's own seeded scoring rule for the same module/activity_code
    // is a DIFFERENT row (own institution_id) — B's evaluator must never match
    // against A's flat 3-point reading rule by accident.
    const ruleMatchB = await evaluateScoring(institutionB, adminB.authUserId, "reading", "weekly_reading_log", {});
    expect(ruleMatchB.rule).toBeTruthy();
    const ruleMatchA = await evaluateScoring(institutionA, adminAuth, "reading", "weekly_reading_log", {});
    expect(ruleMatchB.rule!.id).not.toBe(ruleMatchA.rule!.id);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from score_events where student_id = $1", [student1]);
      expect(rows.rows).toHaveLength(0);
    });
  });
});
