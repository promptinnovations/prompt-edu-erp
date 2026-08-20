/**
 * PROMPT EDU ERP — Multi-part follow-up, items 1 + 5.
 *
 * Item 1 "Daily overview must be visible according to roles — class for
 * teacher, section wise for section heads, institution wide - Principal,
 * management": exercises services/scope/section-head-scope-service.ts
 * directly, plus the shared services/scope/attendance-visibility-service.ts
 * resolver that the Attendance page, Dashboard widget, and Analysis hub card
 * all import identically, plus the stage-scope filtering itself in
 * getDailyAttendanceOverview()/getInstitutionAttendanceTrend().
 *
 * Item 5 "Section" -> "Division" rename: spot-checks that the rename landed
 * in the three places most likely to have been missed — the i18n message
 * catalogue, a service-layer user-facing error string, and the platform
 * permission catalogue gaining attendance.view_section (migration 0034)
 * consistently across seeds/scripts.
 *
 * "Section" is deliberately still used here for the STAGE-grouping concept
 * (KG/LP/UP/HS/HSS) — that's the NEW meaning of "Section" per the user's own
 * clarification, distinct from the renamed A/B/C "Division" concept.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getAllInstitutionPermissionCodes, getPermissionsForUser } from "../../services/permissions/permission-service";
import {
  createClass, createSection, deleteSection, getCurrentAcademicYear,
} from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createTeacherAssignment } from "../../modules/staff/service";
import {
  listAttendanceStatuses, markAttendance, getDailyAttendanceOverview, getInstitutionAttendanceTrend,
} from "../../modules/attendance/service";
import {
  getStaffSectionScope, listDistinctStages, listSectionHeadAssignments,
  assignSectionHead, removeSectionHeadAssignment,
} from "../../services/scope/section-head-scope-service";
import { resolveAttendanceVisibility } from "../../services/scope/attendance-visibility-service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let sectionHeadKgAuth: string, sectionHeadKgUserId: string;
let sectionHeadUnassignedAuth: string, sectionHeadUnassignedUserId: string;
let teacherAuth: string, teacherUserId: string; // assigned to the HS class only
let kgClassId: string, hsClassId: string;
let kgSectionId: string, hsSectionId: string;
let kgStudent: string, hsStudent: string;
let presentStatusId: string, absentStatusId: string;

const DAY = "2026-09-01";

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "sh-school-a");
  institutionB = await seedDemoInstitution(db, "sh-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@sh-a.example", "SH Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const sectionHeadKg = await seedDemoUser(db, institutionA, "sh-kg@sh-a.example", "KG Section Head", "section_head");
  sectionHeadKgAuth = sectionHeadKg.authUserId; sectionHeadKgUserId = sectionHeadKg.userId;

  const sectionHeadUnassigned = await seedDemoUser(db, institutionA, "sh-unassigned@sh-a.example", "Unassigned Section Head", "section_head");
  sectionHeadUnassignedAuth = sectionHeadUnassigned.authUserId; sectionHeadUnassignedUserId = sectionHeadUnassigned.userId;

  const teacher = await seedDemoUser(db, institutionA, "teacher@sh-a.example", "HS Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const kgClass = await createClass(institutionA, adminAuth, adminUserId, { name: "LKG", sortOrder: 1, stage: "KG" });
  kgClassId = kgClass.id;
  const hsClass = await createClass(institutionA, adminAuth, adminUserId, { name: "Class 8", sortOrder: 2, stage: "HS" });
  hsClassId = hsClass.id;

  const kgSection = await createSection(institutionA, adminAuth, adminUserId, { classId: kgClassId, name: "A" });
  kgSectionId = kgSection.id;
  const hsSection = await createSection(institutionA, adminAuth, adminUserId, { classId: hsClassId, name: "A" });
  hsSectionId = hsSection.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "SH-KG-1", fullName: "KG Student" });
  kgStudent = s1.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: kgStudent, academicYearId: year.id, classId: kgClassId, sectionId: kgSectionId });

  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "SH-HS-1", fullName: "HS Student" });
  hsStudent = s2.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: hsStudent, academicYearId: year.id, classId: hsClassId, sectionId: hsSectionId });

  await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
    userId: teacherUserId, classId: hsClassId, academicYearId: year.id, roleType: "class_teacher",
  });

  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  presentStatusId = statuses.find((s) => s.code === "present")!.id;
  absentStatusId = statuses.find((s) => s.code === "absent")!.id;

  await markAttendance(institutionA, adminAuth, adminUserId, {
    classId: kgClassId, sectionId: kgSectionId, date: DAY,
    entries: [{ studentId: kgStudent, statusId: presentStatusId, isLate: false }],
  });
  await markAttendance(institutionA, adminAuth, adminUserId, {
    classId: hsClassId, sectionId: hsSectionId, date: DAY,
    entries: [{ studentId: hsStudent, statusId: absentStatusId, isLate: false }],
  });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Item 1 — assignSectionHead()/getStaffSectionScope() (services/scope/section-head-scope-service.ts)", () => {
  it("a section_head with no assignment yet resolves an empty scope, not an error", async () => {
    const scope = await getStaffSectionScope(institutionA, sectionHeadUnassignedAuth, sectionHeadUnassignedUserId);
    expect(scope.stages.size).toBe(0);
  });

  it("listDistinctStages() reflects the classes actually configured (KG, HS)", async () => {
    const stages = await listDistinctStages(institutionA, adminAuth);
    expect(stages).toContain("KG");
    expect(stages).toContain("HS");
  });

  it("assignSectionHead() then getStaffSectionScope() resolves the assigned stage", async () => {
    await assignSectionHead(institutionA, adminAuth, sectionHeadKgUserId, "KG");
    const scope = await getStaffSectionScope(institutionA, sectionHeadKgAuth, sectionHeadKgUserId);
    expect(scope.stages.has("KG")).toBe(true);
    expect(scope.stages.has("HS")).toBe(false);
  });

  it("assigning the same user/stage twice is idempotent (on conflict do nothing), not a duplicate row or an error", async () => {
    await assignSectionHead(institutionA, adminAuth, sectionHeadKgUserId, "KG");
    const rows = await listSectionHeadAssignments(institutionA, adminAuth);
    const kgRowsForThisUser = rows.filter((r) => r.user_id === sectionHeadKgUserId && r.stage === "KG");
    expect(kgRowsForThisUser).toHaveLength(1);
  });

  it("removeSectionHeadAssignment() removes it — getStaffSectionScope() goes back to empty", async () => {
    const rows = await listSectionHeadAssignments(institutionA, adminAuth);
    const toRemove = rows.find((r) => r.user_id === sectionHeadKgUserId && r.stage === "KG")!;
    await removeSectionHeadAssignment(institutionA, adminAuth, toRemove.id);
    const scope = await getStaffSectionScope(institutionA, sectionHeadKgAuth, sectionHeadKgUserId);
    expect(scope.stages.has("KG")).toBe(false);
    // Re-assign for the remaining tests in this file, which rely on it.
    await assignSectionHead(institutionA, adminAuth, sectionHeadKgUserId, "KG");
  });

  it("tenant isolation: a section_head assigned in Institution A resolves empty when looked up under Institution B", async () => {
    const scope = await getStaffSectionScope(institutionB, adminAuth, sectionHeadKgUserId);
    expect(scope.stages.size).toBe(0);
  });
});

describe("Item 1 — resolveAttendanceVisibility() (services/scope/attendance-visibility-service.ts, the shared resolver)", () => {
  it("an unrestricted holder (attendance.edit) gets institution-wide access with no scope", async () => {
    const permissions = await getPermissionsForUser(adminAuth, adminUserId, institutionA);
    const v = await resolveAttendanceVisibility(institutionA, adminAuth, adminUserId, permissions);
    expect(v.hasAccess).toBe(true);
    expect(v.scope).toBeUndefined();
    expect(v.label).toBe("Institution-wide");
  });

  it("a Section Head (attendance.view_section, assigned KG) gets stage-scoped access, not institution-wide and not class-scoped", async () => {
    const permissions = await getPermissionsForUser(sectionHeadKgAuth, sectionHeadKgUserId, institutionA);
    expect(permissions.has("attendance.view_section")).toBe(true);
    const v = await resolveAttendanceVisibility(institutionA, sectionHeadKgAuth, sectionHeadKgUserId, permissions);
    expect(v.hasAccess).toBe(true);
    expect(v.scope?.stages).toEqual(["KG"]);
    expect(v.scope?.classIds).toBeUndefined();
    expect(v.label).toContain("KG");
  });

  it("a plain teacher (no attendance.view_section) gets class-scoped access from their own assignment, not stage-scoped", async () => {
    const permissions = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(permissions.has("attendance.view_section")).toBe(false);
    const v = await resolveAttendanceVisibility(institutionA, teacherAuth, teacherUserId, permissions);
    expect(v.hasAccess).toBe(true);
    expect(v.scope?.classIds).toEqual([hsClassId]);
    expect(v.scope?.stages).toBeUndefined();
    expect(v.label).toBe("Your class(es)");
  });

  it("a Section Head who holds the permission but has no assignment (and no teacher assignment either) gets no access at all", async () => {
    const permissions = await getPermissionsForUser(sectionHeadUnassignedAuth, sectionHeadUnassignedUserId, institutionA);
    expect(permissions.has("attendance.view_section")).toBe(true);
    const v = await resolveAttendanceVisibility(institutionA, sectionHeadUnassignedAuth, sectionHeadUnassignedUserId, permissions);
    expect(v.hasAccess).toBe(false);
    expect(v.label).toBe("");
  });
});

describe("Item 1 — stage-scope filtering actually restricts the data (getDailyAttendanceOverview / getInstitutionAttendanceTrend)", () => {
  it("getDailyAttendanceOverview() with scope={stages:['KG']} includes the KG class and excludes the HS class", async () => {
    const overview = await getDailyAttendanceOverview(institutionA, adminAuth, DAY, { stages: ["KG"] });
    expect(overview.classes.some((c) => c.classId === kgClassId)).toBe(true);
    expect(overview.classes.some((c) => c.classId === hsClassId)).toBe(false);
  });

  it("getDailyAttendanceOverview() with no scope (institution-wide) includes both classes", async () => {
    const overview = await getDailyAttendanceOverview(institutionA, adminAuth, DAY);
    expect(overview.classes.some((c) => c.classId === kgClassId)).toBe(true);
    expect(overview.classes.some((c) => c.classId === hsClassId)).toBe(true);
  });

  it("getInstitutionAttendanceTrend() with scope={stages:['KG']} only counts the KG class's attendance (100% present) for that day", async () => {
    const trend = await getInstitutionAttendanceTrend(institutionA, adminAuth, 30, { stages: ["KG"] });
    const point = trend.find((p) => p.date === DAY);
    expect(point).toBeTruthy();
    expect(point!.presentPercent).toBe(100); // only the present KG student counted, not the absent HS one
    expect(point!.totalMarked).toBe(1);
  });

  it("getInstitutionAttendanceTrend() with no scope blends both classes (1 present, 1 absent => 50%)", async () => {
    const trend = await getInstitutionAttendanceTrend(institutionA, adminAuth, 30);
    const point = trend.find((p) => p.date === DAY);
    expect(point).toBeTruthy();
    expect(point!.presentPercent).toBe(50);
    expect(point!.totalMarked).toBe(2);
  });
});

describe("Item 5 — \"Section\" -> \"Division\" rename spot-checks", () => {
  it("the i18n message catalogue uses \"Division\"/\"Divisions\" wording, not \"Section\"", async () => {
    const en = (await import("../../i18n/messages/en.json")).default as Record<string, Record<string, string>>;
    expect(en.academic.sectionsHeading).toBe("Divisions");
    expect(en.academic.sectionName).toBe("Division name");
    expect(en.dashboard.sections).toBe("Divisions");
    const ml = (await import("../../i18n/messages/ml.json")).default as Record<string, Record<string, string>>;
    expect(ml.academic.sectionsHeading).not.toBe("സെക്ഷനുകൾ"); // old Malayalam "Sections" wording
  });

  it("deleteSection()'s user-facing guard error says \"division\", not \"section\"", async () => {
    // kgSectionId still has an actively-enrolled student (kgStudent) from
    // the beforeAll fixture, so the enrolled-students guard fires.
    await expect(deleteSection(institutionA, adminAuth, adminUserId, kgSectionId))
      .rejects.toThrow(/division/i);
  });

  it("the platform permission catalogue includes attendance.view_section (migration 0034's self-healing grant, consistent with seeds/0001 and super-admin-service.ts)", async () => {
    const allCodes = await getAllInstitutionPermissionCodes();
    expect(allCodes.has("attendance.view_section")).toBe(true);
  });
});
