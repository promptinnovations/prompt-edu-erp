/**
 * PROMPT EDU ERP — Performance module flow (ARCHITECTURE.md §D.7, Phase 6):
 * skill submission workflow (draft -> submitted -> pending_review/approved,
 * branching on skill_activities.approval_required), reject/return paths,
 * and the achievement submit -> verify -> approve pipeline, with permission
 * boundaries and tenant isolation on every new table from migration 0008.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createStudent } from "../../modules/students/service";
import {
  listSkillTypes, listSkillActivities, createSkillSubmission, submitSkillSubmission,
  reviewSkillSubmission, approveSkillSubmission, listSkillSubmissions,
} from "../../modules/skills/service";
import {
  listAchievementCategories, listAchievementLevels, submitAchievement,
  verifyAchievement, approveAchievement, rejectAchievement, listAchievements,
} from "../../modules/achievements/service";
import { uploadFile } from "../../services/storage/file-service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let managementAuth: string, managementUserId: string;
let student1: string, student2: string;
let readingActivityId: string; // evidence_required=true, verification_required=true, approval_required=false
let essayActivityId: string;   // approval_required=true

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "perf-school-a");
  institutionB = await seedDemoInstitution(db, "perf-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@perf-a.example", "Performance Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const teacher = await seedDemoUser(db, institutionA, "teacher@perf-a.example", "Performance Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const management = await seedDemoUser(db, institutionA, "mgmt@perf-a.example", "Performance Management", "management");
  managementAuth = management.authUserId; managementUserId = management.userId;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PF-1", fullName: "Student One" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PF-2", fullName: "Student Two" });
  student1 = s1.id; student2 = s2.id;

  const skillTypes = await listSkillTypes(institutionA, adminAuth);
  const readingType = skillTypes.find((t) => t.code === "reading")!;
  const writingType = skillTypes.find((t) => t.code === "writing")!;
  const readingActivities = await listSkillActivities(institutionA, adminAuth, readingType.id);
  const writingActivities = await listSkillActivities(institutionA, adminAuth, writingType.id);
  readingActivityId = readingActivities[0].id; // approval_required=false
  essayActivityId = writingActivities[0].id;   // approval_required=true
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Skills workflow (§D.7)", () => {
  it("seeded skill types/activities carry the institution's config, not hard-coded values", async () => {
    const types = await listSkillTypes(institutionA, adminAuth);
    expect(types.map((t) => t.code).sort()).toEqual(["language", "reading", "speaking", "writing"]);
  });

  it("a submission starts as draft and only becomes 'submitted' via submitSkillSubmission()", async () => {
    const submission = await createSkillSubmission(institutionA, teacherAuth, teacherUserId, {
      studentId: student1, skillActivityId: readingActivityId, detailsJsonb: { pagesRead: 40 },
    });
    expect(submission.status).toBe("draft");

    const submitted = await submitSkillSubmission(institutionA, teacherAuth, teacherUserId, submission.id);
    expect(submitted?.status).toBe("submitted");
  });

  it("teacher can review (has skills.review) but not approve (lacks skills.approve)", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "skills.review")).not.toThrow();
    expect(() => requirePermission(teacherPerms, "skills.approve")).toThrow(/Forbidden/);
  });

  it("verifying a submission on an activity with approval_required=false closes it out as approved directly", async () => {
    const [submitted] = await listSkillSubmissions(institutionA, adminAuth, "submitted");
    expect(submitted.activity_name).toBe("Weekly Reading Log");

    const reviewed = await reviewSkillSubmission(institutionA, teacherAuth, teacherUserId, submitted.id, "verified", "Looks good");
    expect(reviewed?.status).toBe("approved");
  });

  it("an activity with approval_required=true stays pending_review after verification, and needs approveSkillSubmission()", async () => {
    const submission = await createSkillSubmission(institutionA, teacherAuth, teacherUserId, {
      studentId: student2, skillActivityId: essayActivityId, detailsJsonb: { wordCount: 500 },
    });
    await submitSkillSubmission(institutionA, teacherAuth, teacherUserId, submission.id);

    const reviewed = await reviewSkillSubmission(institutionA, teacherAuth, teacherUserId, submission.id, "verified", "Well written");
    expect(reviewed?.status).toBe("pending_review");

    // management (has skills.approve) finishes it off
    const managementPerms = await getPermissionsForUser(managementAuth, managementUserId, institutionA);
    expect(() => requirePermission(managementPerms, "skills.approve")).not.toThrow();

    const approved = await approveSkillSubmission(institutionA, managementAuth, managementUserId, submission.id);
    expect(approved?.status).toBe("approved");
  });

  it("approveSkillSubmission() refuses a submission that was never verified", async () => {
    const submission = await createSkillSubmission(institutionA, teacherAuth, teacherUserId, {
      studentId: student1, skillActivityId: essayActivityId,
    });
    await submitSkillSubmission(institutionA, teacherAuth, teacherUserId, submission.id);
    // still 'submitted', not 'pending_review' — approve should just no-op (not throw, since guard checks status first)
    const result = await approveSkillSubmission(institutionA, managementAuth, managementUserId, submission.id);
    expect(result).toBeNull();
  });

  it("a 'rejected' or 'returned' review decision short-circuits regardless of approval_required", async () => {
    const rejectedSubmission = await createSkillSubmission(institutionA, teacherAuth, teacherUserId, { studentId: student2, skillActivityId: readingActivityId });
    await submitSkillSubmission(institutionA, teacherAuth, teacherUserId, rejectedSubmission.id);
    const rejected = await reviewSkillSubmission(institutionA, teacherAuth, teacherUserId, rejectedSubmission.id, "rejected", "Missing evidence");
    expect(rejected?.status).toBe("rejected");

    const returnedSubmission = await createSkillSubmission(institutionA, teacherAuth, teacherUserId, { studentId: student2, skillActivityId: readingActivityId });
    await submitSkillSubmission(institutionA, teacherAuth, teacherUserId, returnedSubmission.id);
    const returned = await reviewSkillSubmission(institutionA, teacherAuth, teacherUserId, returnedSubmission.id, "returned", "Please add page numbers");
    expect(returned?.status).toBe("returned");
  });

  it("evidence_file_id round-trips through createSkillSubmission()/listSkillSubmissions(), and stays null when not attached (§126 follow-up)", async () => {
    const evidence = await uploadFile(institutionA, teacherAuth, teacherUserId, {
      entityType: "skill_submissions", entityId: null, fileName: "reading-log.pdf", mimeType: "application/pdf",
      bytes: Buffer.from("a fake reading log"),
    });

    const withEvidence = await createSkillSubmission(institutionA, teacherAuth, teacherUserId, {
      studentId: student1, skillActivityId: readingActivityId, evidenceFileId: evidence.id,
    });
    expect(withEvidence.evidence_file_id).toBe(evidence.id);

    const drafts = await listSkillSubmissions(institutionA, teacherAuth, "draft");
    const row = drafts.find((d) => d.id === withEvidence.id);
    expect(row?.evidence_file_id).toBe(evidence.id);

    const withoutEvidence = await createSkillSubmission(institutionA, teacherAuth, teacherUserId, {
      studentId: student1, skillActivityId: readingActivityId,
    });
    expect(withoutEvidence.evidence_file_id).toBeNull();
  });
});

describe("Achievements workflow (§D.7)", () => {
  it("seeded achievement categories/levels are institution configuration", async () => {
    const categories = await listAchievementCategories(institutionA, adminAuth);
    expect(categories.map((c) => c.name)).toContain("Sahityotsav");
    const levels = await listAchievementLevels(institutionA, adminAuth);
    expect(levels[0].name).toBe("School");
    expect(levels[levels.length - 1].name).toBe("International");
  });

  it("student/teacher can submit (has achievements.submit) but not verify (lacks achievements.verify)", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "achievements.submit")).not.toThrow();
    expect(() => requirePermission(teacherPerms, "achievements.verify")).toThrow(/Forbidden/);
  });

  it("approveAchievement() refuses an unverified achievement", async () => {
    const categories = await listAchievementCategories(institutionA, adminAuth);
    const levels = await listAchievementLevels(institutionA, adminAuth);
    const achievement = await submitAchievement(institutionA, teacherAuth, teacherUserId, {
      studentId: student1, categoryId: categories[0].id, levelId: levels[0].id, title: "Essay competition winner", position: "1st",
    });
    expect(achievement.status).toBe("pending");

    await expect(
      approveAchievement(institutionA, managementAuth, managementUserId, achievement.id)
    ).rejects.toThrow(/must be verified/);

    const verified = await verifyAchievement(institutionA, managementAuth, managementUserId, achievement.id);
    expect(verified?.verified_by).toBe(managementUserId);
    expect(verified?.status).toBe("pending"); // verification alone does not approve

    const approved = await approveAchievement(institutionA, managementAuth, managementUserId, achievement.id);
    expect(approved?.status).toBe("approved");
    expect(approved?.approved_by).toBe(managementUserId);
  });

  it("rejectAchievement() marks a pending achievement rejected without requiring verification", async () => {
    const categories = await listAchievementCategories(institutionA, adminAuth);
    const levels = await listAchievementLevels(institutionA, adminAuth);
    const achievement = await submitAchievement(institutionA, teacherAuth, teacherUserId, {
      studentId: student2, categoryId: categories[1].id, levelId: levels[0].id, title: "Unverifiable claim",
    });
    const rejected = await rejectAchievement(institutionA, managementAuth, managementUserId, achievement.id);
    expect(rejected?.status).toBe("rejected");

    const list = await listAchievements(institutionA, adminAuth, "rejected");
    expect(list.some((a) => a.id === achievement.id)).toBe(true);
  });
});

describe("Performance module tenant isolation (§E, extended to migration 0008 tables)", () => {
  it("Institution B cannot see Institution A's skill submissions or achievements", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@perf-b.example", "Performance B Admin");

    const submissionsB = await listSkillSubmissions(institutionB, adminB.authUserId);
    expect(submissionsB).toHaveLength(0);

    const achievementsB = await listAchievements(institutionB, adminB.authUserId);
    expect(achievementsB).toHaveLength(0);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from skill_submissions where student_id = $1", [student1]);
      expect(rows.rows).toHaveLength(0);
    });
  });
});
