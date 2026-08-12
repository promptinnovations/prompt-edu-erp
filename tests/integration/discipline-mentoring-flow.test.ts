/**
 * PROMPT EDU ERP — Discipline/character/mentoring flow (ARCHITECTURE.md
 * §D.8, §F.4/§75 confidentiality, §F.5 ownership rules, Phase 11):
 * discipline category/record config and CRUD, character attribute config
 * and assessments feeding the scoring engine's 'character' component,
 * mentoring's self-authorship (mentor_id always the ACTING staff member,
 * never caller-suppliable), view_all-vs-assigned-mentor visibility scoping,
 * edit restricted to the assigned mentor even for view_all holders, the
 * Student 360 extension (openMentoringGoals/activeDisciplineFlags,
 * non-breaking when scope is omitted), permission boundaries, and tenant
 * isolation on every new table from migration 0013.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission, can } from "../../services/permissions/permission-service";
import { createStudent } from "../../modules/students/service";
import { createStaffMember } from "../../modules/staff/service";
import {
  listDisciplineCategories, createDisciplineCategory, createDisciplineRecord, listDisciplineRecords,
  recordDisciplineFollowUp, listRecentNegativeDisciplineFlags,
  listCharacterAttributes, createCharacterAttribute, recordCharacterAssessment, listCharacterAssessments,
  getCharacterScoreAverage,
} from "../../modules/discipline/service";
import {
  getOwnStaffId, createMentoringRecord, listMentoringRecords, getMentoringRecord,
  updateMentoringRecord, listOpenMentoringGoals, type MentoringScope,
} from "../../modules/mentoring/service";
import { getNormalizedScore } from "../../modules/scoring/service";
import { getStudent360 } from "../../modules/portfolio/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let managementAuth: string, managementUserId: string;
let teacher1Auth: string, teacher1UserId: string, teacher1StaffId: string;
let teacher2Auth: string, teacher2UserId: string, teacher2StaffId: string;
let plainTeacherAuth: string, plainTeacherUserId: string; // teacher role, no staff record
let student1: string;

const FROM_DATE = "2026-08-01";
const TO_DATE = "2026-08-31";

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "dm-school-a");
  institutionB = await seedDemoInstitution(db, "dm-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@dm-a.example", "DM Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const management = await seedDemoUser(db, institutionA, "mgmt@dm-a.example", "DM Management", "management");
  managementAuth = management.authUserId; managementUserId = management.userId;

  const plainTeacher = await seedDemoUser(db, institutionA, "plain-teacher@dm-a.example", "Plain Teacher", "teacher");
  plainTeacherAuth = plainTeacher.authUserId; plainTeacherUserId = plainTeacher.userId;

  const staff1 = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "mentor1@dm-a.example", fullName: "Mentor One", staffCode: "M-001",
    employmentStatus: "active", roleCode: "teacher",
  });
  teacher1StaffId = staff1.id; teacher1UserId = staff1.user_id;
  teacher1Auth = admin.authUserId; // resolve auth id below via membership lookup
  // seedDemoUser links auth_user_id itself; createStaffMember creates the user
  // without an auth_user_id (dev-mode has no login for it), so mint one the
  // same way seedDemoUser does, for use as this test's "acting as teacher1" auth id.
  {
    const authId = crypto.randomUUID();
    await db.query("update users set auth_user_id = $1 where id = $2", [authId, teacher1UserId]);
    teacher1Auth = authId;
  }

  const staff2 = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "mentor2@dm-a.example", fullName: "Mentor Two", staffCode: "M-002",
    employmentStatus: "active", roleCode: "teacher",
  });
  teacher2StaffId = staff2.id; teacher2UserId = staff2.user_id;
  {
    const authId = crypto.randomUUID();
    await db.query("update users set auth_user_id = $1 where id = $2", [authId, teacher2UserId]);
    teacher2Auth = authId;
  }

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "DM-1", fullName: "Student One" });
  student1 = s1.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Discipline (§D.8)", () => {
  it("seeded discipline categories carry institution config, not hard-coded values", async () => {
    const categories = await listDisciplineCategories(institutionA, adminAuth);
    expect(categories.some((c) => c.name === "Disruptive behaviour" && !c.is_positive)).toBe(true);
    expect(categories.some((c) => c.name === "Exemplary conduct" && c.is_positive)).toBe(true);
  });

  it("createDisciplineCategory() adds an institution-specific category", async () => {
    const created = await createDisciplineCategory(institutionA, adminAuth, adminUserId, { name: "Custom category", isPositive: false });
    expect(created.name).toBe("Custom category");
  });

  it("createDisciplineRecord()/listDisciplineRecords() record and retrieve entries", async () => {
    const categories = await listDisciplineCategories(institutionA, adminAuth);
    const negative = categories.find((c) => c.name === "Late to class")!;
    await createDisciplineRecord(institutionA, plainTeacherAuth, plainTeacherUserId, {
      studentId: student1, categoryId: negative.id, date: "2026-08-05", description: "Arrived 15 minutes late",
    });
    const records = await listDisciplineRecords(institutionA, adminAuth, student1);
    expect(records).toHaveLength(1);
    expect(records[0].category_name).toBe("Late to class");
    expect(records[0].is_positive).toBe(false);
  });

  it("recordDisciplineFollowUp() attaches a follow-up note", async () => {
    const [record] = await listDisciplineRecords(institutionA, adminAuth, student1);
    const updated = await recordDisciplineFollowUp(institutionA, adminAuth, adminUserId, record.id, { followUpNotes: "Spoke with parent" });
    expect(updated?.id).toBe(record.id);
    const [refetched] = await listDisciplineRecords(institutionA, adminAuth, student1);
    expect(refetched.follow_up_notes).toBe("Spoke with parent");
  });

  it("listRecentNegativeDisciplineFlags() only returns negative categories within the window", async () => {
    const categories = await listDisciplineCategories(institutionA, adminAuth);
    const positive = categories.find((c) => c.name === "Helped a classmate")!;
    await createDisciplineRecord(institutionA, plainTeacherAuth, plainTeacherUserId, {
      studentId: student1, categoryId: positive.id, date: "2026-08-06", description: "Helped a new student settle in",
    });
    const flags = await listRecentNegativeDisciplineFlags(institutionA, adminAuth, student1, "2026-08-01");
    expect(flags.every((f) => !f.is_positive)).toBe(true);
    expect(flags.length).toBe(1);
  });

  it("teacher (has discipline.record) can record but management-only view (discipline.view) is separate", async () => {
    const teacherPerms = await getPermissionsForUser(plainTeacherAuth, plainTeacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "discipline.record")).not.toThrow();
    const managementPerms = await getPermissionsForUser(managementAuth, managementUserId, institutionA);
    expect(() => requirePermission(managementPerms, "discipline.view")).not.toThrow();
  });
});

describe("Character assessments (§D.8) feeding the scoring engine", () => {
  it("seeded character attributes carry institution config", async () => {
    const attrs = await listCharacterAttributes(institutionA, adminAuth);
    expect(attrs.map((a) => a.name)).toContain("Responsibility");
  });

  it("createCharacterAttribute() adds a custom attribute", async () => {
    const created = await createCharacterAttribute(institutionA, adminAuth, adminUserId, { name: "Creativity" });
    expect(created.name).toBe("Creativity");
  });

  it("recordCharacterAssessment()/listCharacterAssessments() record and retrieve ratings", async () => {
    const attrs = await listCharacterAttributes(institutionA, adminAuth);
    const responsibility = attrs.find((a) => a.name === "Responsibility")!;
    const respect = attrs.find((a) => a.name === "Respect")!;
    await recordCharacterAssessment(institutionA, plainTeacherAuth, plainTeacherUserId, {
      studentId: student1, attributeId: responsibility.id, period: "Term 1", rating: 4,
    });
    await recordCharacterAssessment(institutionA, plainTeacherAuth, plainTeacherUserId, {
      studentId: student1, attributeId: respect.id, period: "Term 1", rating: 5,
    });
    const assessments = await listCharacterAssessments(institutionA, adminAuth, student1);
    expect(assessments).toHaveLength(2);
  });

  it("getCharacterScoreAverage() normalizes avg(rating)/5*100, and getNormalizedScore('character', ...) matches it", async () => {
    const avg = await getCharacterScoreAverage(institutionA, adminAuth, student1, FROM_DATE, TO_DATE);
    expect(avg).toBeCloseTo(90, 1); // (4+5)/2 = 4.5 -> 90%

    const viaScoring = await getNormalizedScore(institutionA, adminAuth, "character", student1, FROM_DATE, TO_DATE);
    expect(viaScoring).toBeCloseTo(avg, 5);
  });

  it("getCharacterScoreAverage() returns 0 (not null/NaN) for a student with no assessments", async () => {
    const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "DM-2", fullName: "Student Two" });
    const avg = await getCharacterScoreAverage(institutionA, adminAuth, s2.id, FROM_DATE, TO_DATE);
    expect(avg).toBe(0);
  });
});

describe("Mentoring (§D.8, §F.4/§75, §F.5)", () => {
  it("getOwnStaffId() resolves a staff member's own staff.id, null for a non-staff user", async () => {
    const resolved = await getOwnStaffId(institutionA, teacher1Auth, teacher1UserId);
    expect(resolved).toBe(teacher1StaffId);

    const notStaff = await getOwnStaffId(institutionA, plainTeacherAuth, plainTeacherUserId);
    expect(notStaff).toBeNull();
  });

  it("createMentoringRecord() throws for a caller who isn't a staff member", async () => {
    await expect(
      createMentoringRecord(institutionA, plainTeacherAuth, plainTeacherUserId, {
        studentId: student1, date: "2026-08-10", goals: "Improve punctuality", confidentialityLevel: "standard",
      })
    ).rejects.toThrow(/staff members/);
  });

  it("createMentoringRecord() fixes mentor_id to the ACTING staff member's own id, never a caller-supplied value", async () => {
    const record = await createMentoringRecord(institutionA, teacher1Auth, teacher1UserId, {
      studentId: student1, date: "2026-08-10",
      academicObservation: "Doing well in Arabic", goals: "Improve punctuality", actionPlan: "Daily check-in",
      confidentialityLevel: "standard",
    });
    expect(record.mentor_id).toBe(teacher1StaffId);
    expect(record.mentor_name).toBe("Mentor One");
  });

  it("listMentoringRecords(): view_all sees everyone's records; a non-view_all mentor sees only their own", async () => {
    await createMentoringRecord(institutionA, teacher2Auth, teacher2UserId, {
      studentId: student1, date: "2026-08-11", behaviourObservation: "Settling in well", confidentialityLevel: "restricted",
    });

    const viewAllScope: MentoringScope = { canViewAll: true, ownMentorStaffId: null };
    const all = await listMentoringRecords(institutionA, adminAuth, viewAllScope, student1);
    expect(all).toHaveLength(2);

    const mentor1Scope: MentoringScope = { canViewAll: false, ownMentorStaffId: teacher1StaffId };
    const mentor1Records = await listMentoringRecords(institutionA, teacher1Auth, mentor1Scope, student1);
    expect(mentor1Records).toHaveLength(1);
    expect(mentor1Records[0].mentor_id).toBe(teacher1StaffId);

    const mentor2Scope: MentoringScope = { canViewAll: false, ownMentorStaffId: teacher2StaffId };
    const mentor2Records = await listMentoringRecords(institutionA, teacher2Auth, mentor2Scope, student1);
    expect(mentor2Records).toHaveLength(1);
    expect(mentor2Records[0].mentor_id).toBe(teacher2StaffId);
  });

  it("listMentoringRecords() returns nothing for a caller with neither view_all nor a staff id", async () => {
    const noScope: MentoringScope = { canViewAll: false, ownMentorStaffId: null };
    const result = await listMentoringRecords(institutionA, plainTeacherAuth, noScope, student1);
    expect(result).toHaveLength(0);
  });

  it("getMentoringRecord() returns null (not an error) for a non-owner without view_all — no existence leak", async () => {
    const all = await listMentoringRecords(institutionA, adminAuth, { canViewAll: true, ownMentorStaffId: null }, student1);
    const teacher1Record = all.find((r) => r.mentor_id === teacher1StaffId)!;

    const mentor2Scope: MentoringScope = { canViewAll: false, ownMentorStaffId: teacher2StaffId };
    const hidden = await getMentoringRecord(institutionA, teacher2Auth, mentor2Scope, teacher1Record.id);
    expect(hidden).toBeNull();

    const mentor1Scope: MentoringScope = { canViewAll: false, ownMentorStaffId: teacher1StaffId };
    const visible = await getMentoringRecord(institutionA, teacher1Auth, mentor1Scope, teacher1Record.id);
    expect(visible?.id).toBe(teacher1Record.id);
  });

  it("updateMentoringRecord() is restricted to the assigned mentor — even a view_all holder (management) cannot edit someone else's note", async () => {
    const all = await listMentoringRecords(institutionA, adminAuth, { canViewAll: true, ownMentorStaffId: null }, student1);
    const teacher1Record = all.find((r) => r.mentor_id === teacher1StaffId)!;

    // management has mentoring.view_all but is not the assigned mentor
    const managementAttempt = await updateMentoringRecord(
      institutionA, managementAuth, managementUserId, null, teacher1Record.id, { goals: "Overwritten by management" }
    );
    expect(managementAttempt).toBeNull();

    const ownerUpdate = await updateMentoringRecord(
      institutionA, teacher1Auth, teacher1UserId, teacher1StaffId, teacher1Record.id, { goals: "Revised: focus on Arabic reading" }
    );
    expect(ownerUpdate?.id).toBe(teacher1Record.id);

    const refetched = await getMentoringRecord(
      institutionA, teacher1Auth, { canViewAll: false, ownMentorStaffId: teacher1StaffId }, teacher1Record.id
    );
    expect(refetched?.goals).toBe("Revised: focus on Arabic reading");
  });

  it("listOpenMentoringGoals() only returns records that actually set goals/action_plan", async () => {
    const goals = await listOpenMentoringGoals(
      institutionA, adminAuth, { canViewAll: true, ownMentorStaffId: null }, student1
    );
    expect(goals.length).toBeGreaterThan(0);
    expect(goals.every((g) => g.goals || g.action_plan)).toBe(true);
  });

  it("teacher without a staff record (mentoring.create granted but not staff) still cannot author a record", async () => {
    const perms = await getPermissionsForUser(plainTeacherAuth, plainTeacherUserId, institutionA);
    expect(can(perms, "mentoring.create")).toBe(true); // has the permission…
    await expect(
      createMentoringRecord(institutionA, plainTeacherAuth, plainTeacherUserId, { studentId: student1, date: "2026-08-12", confidentialityLevel: "standard" })
    ).rejects.toThrow(); // …but service-layer ownership check still blocks it
  });
});

describe("Student 360 extension (§L.4)", () => {
  it("omitting scope keeps openMentoringGoals/activeDisciplineFlags null (non-breaking for pre-Phase-11 callers)", async () => {
    const summary = await getStudent360(institutionA, adminAuth, student1);
    expect(summary.openMentoringGoals).toBeNull();
    expect(summary.activeDisciplineFlags).toBeNull();
  });

  it("passing scope populates both, permission-gated", async () => {
    const summary = await getStudent360(institutionA, adminAuth, student1, 10, {
      mentoring: { canViewAll: true, ownMentorStaffId: null },
      canViewDiscipline: true,
    });
    expect(summary.openMentoringGoals).not.toBeNull();
    expect(summary.openMentoringGoals!.length).toBeGreaterThan(0);
    expect(summary.activeDisciplineFlags).not.toBeNull();
  });
});

describe("Discipline/character/mentoring tenant isolation (§E, extended to migration 0013 tables)", () => {
  it("Institution B cannot see Institution A's discipline records, character assessments, or mentoring records", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@dm-b.example", "DM B Admin");

    expect(await listDisciplineRecords(institutionB, adminB.authUserId)).toHaveLength(0);
    expect(await listCharacterAssessments(institutionB, adminB.authUserId)).toHaveLength(0);
    const allB = await listMentoringRecords(institutionB, adminB.authUserId, { canViewAll: true, ownMentorStaffId: null });
    expect(allB).toHaveLength(0);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from mentoring_records where student_id = $1", [student1]);
      expect(rows.rows).toHaveLength(0);
    });
  });
});
