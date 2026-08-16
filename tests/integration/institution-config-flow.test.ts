/**
 * PROMPT EDU ERP — institution-specific points/grading configuration
 * (§137 follow-up: "the same system should work with other institution as
 * well, data will be different, sometimes configurations also will be
 * different: marking scheme/grading/points for achievements and skills").
 *
 * Before this phase, grade_scales/grade_bands, scoring_rules,
 * achievement_categories/achievement_levels, and skill_types/
 * skill_activities were all createable-and-readable (or read-only) but had
 * no update/delete surface at all — an institution wanting its own
 * grading scheme, its own point values, or its own achievement/skill
 * taxonomy had no way to change what a seed script happened to insert.
 * This file covers the new CRUD for all four, including the "don't let a
 * delete silently corrupt already-recorded history" guards each one needs
 * (a delete-guard bug here would look identical to the class/section
 * enrollment guard bug class already covered in student-admin-flow.test.ts).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination,
  listGradeScales, createGradeScale, updateGradeScale, deleteGradeScale, setDefaultGradeScale,
  createGradeBand, updateGradeBand, deleteGradeBand, getGradeBands,
} from "../../modules/examination/service";
import {
  listScoringRules, createScoringRule, updateScoringRule, deleteScoringRule, recordScoreEvent,
} from "../../modules/scoring/service";
import {
  createAchievementCategory, updateAchievementCategory, deleteAchievementCategory,
  createAchievementLevel, updateAchievementLevel, deleteAchievementLevel,
  listAchievementCategories, listAchievementLevels, submitAchievement,
} from "../../modules/achievements/service";
import {
  createSkillType, updateSkillType, deleteSkillType,
  createSkillActivity, updateSkillActivity, deleteSkillActivity,
  listSkillTypes, listSkillActivitiesForAdmin, createSkillSubmission,
} from "../../modules/skills/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "config-school-a");
  institutionB = await seedDemoInstitution(db, "config-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@config-a.example", "Config Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Grade scales / bands", () => {
  it("creates, renames, and sets a new default; only one scale is default at a time", async () => {
    const scale = await createGradeScale(institutionA, adminAuth, adminUserId, { name: "Kithab Pass/Fail" });
    expect(scale.is_default).toBe(false);

    await setDefaultGradeScale(institutionA, adminAuth, adminUserId, scale.id);
    const scales = await listGradeScales(institutionA, adminAuth);
    const defaults = scales.filter((s) => s.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(scale.id);

    const renamed = await updateGradeScale(institutionA, adminAuth, adminUserId, scale.id, { name: "Kithab Pass/Fail (renamed)" });
    expect(renamed.name).toBe("Kithab Pass/Fail (renamed)");
  });

  it("adds/updates/deletes grade bands, rejects min > max", async () => {
    const scale = await createGradeScale(institutionA, adminAuth, adminUserId, { name: "Band Test Scale" });
    const band = await createGradeBand(institutionA, adminAuth, adminUserId, {
      gradeScaleId: scale.id, minPercent: 90, maxPercent: 100, gradeLabel: "A+", gradePoint: 4,
    });
    await expect(createGradeBand(institutionA, adminAuth, adminUserId, {
      gradeScaleId: scale.id, minPercent: 50, maxPercent: 10, gradeLabel: "Bad", gradePoint: null,
    })).rejects.toThrow(/cannot exceed/);

    const updated = await updateGradeBand(institutionA, adminAuth, adminUserId, band.id, { gradeLabel: "A++" });
    expect(updated.grade_label).toBe("A++");

    await deleteGradeBand(institutionA, adminAuth, adminUserId, band.id);
    const bands = await getGradeBands(institutionA, adminAuth, scale.id);
    expect(bands).toHaveLength(0);
  });

  it("refuses to delete a grade scale used by an examination; deletes a truly unused one", async () => {
    const usedScale = await createGradeScale(institutionA, adminAuth, adminUserId, { name: "In-Use Scale" });
    const unusedScale = await createGradeScale(institutionA, adminAuth, adminUserId, { name: "Unused Scale" });

    const examTypes = await listExamTypes(institutionA, adminAuth);
    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examTypes[0].id, academicYearId: year!.id, name: "Guard Test Exam", gradeScaleId: usedScale.id,
    });

    await expect(deleteGradeScale(institutionA, adminAuth, adminUserId, usedScale.id)).rejects.toThrow(/used by one or more examinations/);
    await expect(deleteGradeScale(institutionA, adminAuth, adminUserId, unusedScale.id)).resolves.toBeUndefined();
  });
});

describe("Scoring rules", () => {
  it("creates, updates points/max/active, and deactivating still lets it be found (not filtered out of listScoringRules)", async () => {
    const rule = await createScoringRule(institutionA, adminAuth, adminUserId, {
      module: "reading", activityCode: "custom_book_report", conditionJsonb: {}, points: 5,
      verificationRequired: true, approvalRequired: true,
    });
    const updated = await updateScoringRule(institutionA, adminAuth, adminUserId, rule.id, { points: 8, maxPoints: 20, isActive: false });
    expect(updated.points).toBe("8.00");
    expect(updated.is_active).toBe(false);

    const rules = await listScoringRules(institutionA, adminAuth, "reading");
    expect(rules.some((r) => r.id === rule.id)).toBe(true);
  });

  it("refuses to delete a rule that already produced a score event; deletes an unused one", async () => {
    const usedRule = await createScoringRule(institutionA, adminAuth, adminUserId, {
      module: "writing", activityCode: "used_rule", conditionJsonb: {}, points: 3, verificationRequired: true, approvalRequired: true,
    });
    const unusedRule = await createScoringRule(institutionA, adminAuth, adminUserId, {
      module: "writing", activityCode: "unused_rule", conditionJsonb: {}, points: 3, verificationRequired: true, approvalRequired: true,
    });
    const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "CFG-SCORE-1", fullName: "Score Config Student" });

    await recordScoreEvent(institutionA, adminAuth, adminUserId, {
      studentId: student.id, sourceModule: "writing", sourceEntityType: "test", sourceEntityId: null, points: 3, scoringRuleId: usedRule.id,
    });

    await expect(deleteScoringRule(institutionA, adminAuth, adminUserId, usedRule.id)).rejects.toThrow(/already been used/);
    await expect(deleteScoringRule(institutionA, adminAuth, adminUserId, unusedRule.id)).resolves.toBeUndefined();
  });
});

describe("Achievement categories / levels", () => {
  it("creates and updates a category and a level", async () => {
    const category = await createAchievementCategory(institutionA, adminAuth, adminUserId, { name: "Debate" });
    const renamed = await updateAchievementCategory(institutionA, adminAuth, adminUserId, category.id, { name: "Debate & Elocution" });
    expect(renamed.name).toBe("Debate & Elocution");

    const level = await createAchievementLevel(institutionA, adminAuth, adminUserId, { name: "Custom Zone", sortOrder: 1 });
    const renamedLevel = await updateAchievementLevel(institutionA, adminAuth, adminUserId, level.id, { sortOrder: 2 });
    expect(renamedLevel.sort_order).toBe(2);
  });

  it("refuses to delete a category/level already used by a recorded achievement; deletes unused ones", async () => {
    const category = await createAchievementCategory(institutionA, adminAuth, adminUserId, { name: "Used Category" });
    const level = await createAchievementLevel(institutionA, adminAuth, adminUserId, { name: "Used Level", sortOrder: 0 });
    const spareCategory = await createAchievementCategory(institutionA, adminAuth, adminUserId, { name: "Spare Category" });
    const spareLevel = await createAchievementLevel(institutionA, adminAuth, adminUserId, { name: "Spare Level", sortOrder: 0 });
    const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "CFG-ACH-1", fullName: "Achievement Config Student" });

    await submitAchievement(institutionA, adminAuth, adminUserId, {
      studentId: student.id, categoryId: category.id, levelId: level.id, title: "Guard test achievement",
    });

    await expect(deleteAchievementCategory(institutionA, adminAuth, adminUserId, category.id)).rejects.toThrow(/achievements recorded/);
    await expect(deleteAchievementLevel(institutionA, adminAuth, adminUserId, level.id)).rejects.toThrow(/achievements recorded/);
    await expect(deleteAchievementCategory(institutionA, adminAuth, adminUserId, spareCategory.id)).resolves.toBeUndefined();
    await expect(deleteAchievementLevel(institutionA, adminAuth, adminUserId, spareLevel.id)).resolves.toBeUndefined();

    const categories = await listAchievementCategories(institutionA, adminAuth);
    expect(categories.some((c) => c.id === spareCategory.id)).toBe(false);
    const levels = await listAchievementLevels(institutionA, adminAuth);
    expect(levels.some((l) => l.id === spareLevel.id)).toBe(false);
  });
});

describe("Skill types / activities", () => {
  it("creates a type + activity, updates, and deactivating hides it from nothing but listSkillActivitiesForAdmin still sees it", async () => {
    const type = await createSkillType(institutionA, adminAuth, adminUserId, { name: "Public Speaking" });
    expect(type.code).toBe("public_speaking");
    const renamedType = await updateSkillType(institutionA, adminAuth, adminUserId, type.id, { name: "Public Speaking & Debate" });
    expect(renamedType.name).toBe("Public Speaking & Debate");

    const activity = await createSkillActivity(institutionA, adminAuth, adminUserId, {
      skillTypeId: type.id, name: "Assembly speech", evidenceRequired: true, verificationRequired: true, approvalRequired: false,
    });
    const deactivated = await updateSkillActivity(institutionA, adminAuth, adminUserId, activity.id, { isActive: false });
    expect(deactivated.is_active).toBe(false);

    const adminView = await listSkillActivitiesForAdmin(institutionA, adminAuth, type.id);
    expect(adminView.some((a) => a.id === activity.id)).toBe(true);
  });

  it("refuses to delete a type that still has activities, and an activity already submitted against", async () => {
    const type = await createSkillType(institutionA, adminAuth, adminUserId, { name: "Calligraphy" });
    const usedActivity = await createSkillActivity(institutionA, adminAuth, adminUserId, {
      skillTypeId: type.id, name: "Used activity", evidenceRequired: false, verificationRequired: true, approvalRequired: false,
    });
    const unusedActivity = await createSkillActivity(institutionA, adminAuth, adminUserId, {
      skillTypeId: type.id, name: "Unused activity", evidenceRequired: false, verificationRequired: true, approvalRequired: false,
    });
    const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "CFG-SKILL-1", fullName: "Skill Config Student" });

    await createSkillSubmission(institutionA, adminAuth, adminUserId, { skillActivityId: usedActivity.id, studentId: student.id });

    await expect(deleteSkillActivity(institutionA, adminAuth, adminUserId, usedActivity.id)).rejects.toThrow(/already has student submissions/);
    await expect(deleteSkillType(institutionA, adminAuth, adminUserId, type.id)).rejects.toThrow(/still has activities/);

    await deleteSkillActivity(institutionA, adminAuth, adminUserId, unusedActivity.id);
    // The type still has the (used, submitted-against) activity under it, so it remains blocked.
    await expect(deleteSkillType(institutionA, adminAuth, adminUserId, type.id)).rejects.toThrow(/still has activities/);

    const emptyType = await createSkillType(institutionA, adminAuth, adminUserId, { name: "Empty Type" });
    await expect(deleteSkillType(institutionA, adminAuth, adminUserId, emptyType.id)).resolves.toBeUndefined();
  });
});

describe("Tenant isolation (§E)", () => {
  it("Institution B never sees Institution A's grade scales, scoring rules, achievement/skill config", async () => {
    const db = await getDbClient();
    const adminB = await seedDemoUser(db, institutionB, "admin@config-b.example", "Config B Admin", "institution_admin");

    const scalesB = await listGradeScales(institutionB, adminB.authUserId);
    expect(scalesB.every((s) => s.name !== "Kithab Pass/Fail")).toBe(true);

    const typesB = await listSkillTypes(institutionB, adminB.authUserId);
    expect(typesB.every((t) => t.name !== "Public Speaking & Debate")).toBe(true);

    // And B can independently create a same-named skill type without colliding with A's.
    await expect(createSkillType(institutionB, adminB.authUserId, adminB.userId, { name: "Calligraphy" })).resolves.toBeDefined();
  });
});
