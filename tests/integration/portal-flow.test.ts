/**
 * PROMPT EDU ERP — Portal identity flow (ARCHITECTURE.md §D.4, §Z "(portals)/"
 * route group, Phase 12): parent CRUD and student_parents linking,
 * provisioning a student/parent portal account (reusing the RLS-safe
 * insert pattern from Phase 10), identity resolution (getOwnStudentId/
 * getOwnParentId), parent/child scoping (a parent can never resolve
 * another family's child), portal-routing role resolution, and tenant
 * isolation on migration 0014's new columns/relationships.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getRoleCodesForUser } from "../../services/permissions/permission-service";
import { createStudent } from "../../modules/students/service";
import {
  createParent, listParents, linkParentToStudent, listParentsForStudent,
} from "../../modules/students/service";
import {
  getOwnStudentId, getOwnParentId, listChildrenForParent, isOwnChild,
  provisionStudentPortalAccount, provisionParentPortalAccount, resolvePortalDestination,
} from "../../modules/portal/service";
import { applyForLeave, listLeaveApplicationsForStudent } from "../../modules/attendance/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let student1: string, student2: string;
let parent1: string, parent2: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "portal-school-a");
  institutionB = await seedDemoInstitution(db, "portal-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@portal-a.example", "Portal Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PT-1", fullName: "Student One" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PT-2", fullName: "Student Two" });
  student1 = s1.id; student2 = s2.id;

  const p1 = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Parent One", email: "parent1@portal-a.example" });
  const p2 = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Parent Two", email: "parent2@portal-a.example" });
  parent1 = p1.id; parent2 = p2.id;

  await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: student1, parentId: parent1, relationship: "Father", isPrimaryContact: true });
  await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: student2, parentId: parent2, relationship: "Mother", isPrimaryContact: true });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Parent management (§D.4)", () => {
  it("createParent()/listParents() create and list parent records", async () => {
    const parents = await listParents(institutionA, adminAuth);
    expect(parents.map((p) => p.full_name).sort()).toEqual(["Parent One", "Parent Two"]);
  });

  it("linkParentToStudent()/listParentsForStudent() associate a parent with a student", async () => {
    const linked = await listParentsForStudent(institutionA, adminAuth, student1);
    expect(linked).toHaveLength(1);
    expect(linked[0].full_name).toBe("Parent One");
    expect(linked[0].relationship).toBe("Father");
    expect(linked[0].is_primary_contact).toBe(true);
  });

  it("linking the same parent/student pair again updates rather than duplicating (on conflict)", async () => {
    await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: student1, parentId: parent1, relationship: "Guardian", isPrimaryContact: true });
    const linked = await listParentsForStudent(institutionA, adminAuth, student1);
    expect(linked).toHaveLength(1);
    expect(linked[0].relationship).toBe("Guardian");
  });
});

describe("Portal account provisioning (§Z, RLS-safe insert pattern)", () => {
  it("provisionStudentPortalAccount() creates a user, membership, student role, and links students.user_id", async () => {
    const result = await provisionStudentPortalAccount(institutionA, adminAuth, adminUserId, {
      studentId: student1, email: "student1-login@portal-a.example", fullName: "Student One",
    });
    expect(result.userId).toBeTruthy();

    const ownId = await getOwnStudentId(institutionA, adminAuth, result.userId);
    expect(ownId).toBe(student1);

    const roleCodes = await getRoleCodesForUser(adminAuth, result.userId, institutionA);
    expect(roleCodes.has("student")).toBe(true);
  });

  it("provisioning a second account for an already-linked student throws", async () => {
    await expect(
      provisionStudentPortalAccount(institutionA, adminAuth, adminUserId, {
        studentId: student1, email: "student1-second@portal-a.example", fullName: "Student One",
      })
    ).rejects.toThrow(/already has a portal account/);
  });

  it("provisionParentPortalAccount() creates a user, membership, parent role, and links parents.user_id", async () => {
    const result = await provisionParentPortalAccount(institutionA, adminAuth, adminUserId, {
      parentId: parent1, email: "parent1-login@portal-a.example", fullName: "Parent One",
    });
    const ownId = await getOwnParentId(institutionA, adminAuth, result.userId);
    expect(ownId).toBe(parent1);

    const roleCodes = await getRoleCodesForUser(adminAuth, result.userId, institutionA);
    expect(roleCodes.has("parent")).toBe(true);
  });

  it("getOwnStudentId()/getOwnParentId() return null for a user with no linked record", async () => {
    const random = await seedDemoUser(await getDbClient(), institutionA, "random@portal-a.example", "Random User");
    expect(await getOwnStudentId(institutionA, random.authUserId, random.userId)).toBeNull();
    expect(await getOwnParentId(institutionA, random.authUserId, random.userId)).toBeNull();
  });
});

describe("Parent/child scoping (§75-style application-layer gate)", () => {
  it("listChildrenForParent() only ever returns THIS parent's own children", async () => {
    const children = await listChildrenForParent(institutionA, adminAuth, parent1);
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(student1);
  });

  it("isOwnChild() correctly distinguishes a parent's own child from someone else's", async () => {
    expect(await isOwnChild(institutionA, adminAuth, parent1, student1)).toBe(true);
    expect(await isOwnChild(institutionA, adminAuth, parent1, student2)).toBe(false);
  });
});

describe("Portal routing resolution (§Z)", () => {
  it("resolvePortalDestination(): pure roles route to their own portal, mixed/other roles stay in the admin app", () => {
    expect(resolvePortalDestination(new Set(["student"]))).toBe("student");
    expect(resolvePortalDestination(new Set(["parent"]))).toBe("parent");
    expect(resolvePortalDestination(new Set(["student", "parent"]))).toBe("parent"); // parent takes priority
    expect(resolvePortalDestination(new Set(["teacher"]))).toBe("institution");
    expect(resolvePortalDestination(new Set(["student", "teacher"]))).toBe("institution"); // any non-portal role wins
    expect(resolvePortalDestination(new Set())).toBe("institution");
  });
});

describe("Parent leave applications (§D.6 follow-up 'parents log in need an option to apply for leave')", () => {
  it("listLeaveApplicationsForStudent() scopes to exactly one student's own applications", async () => {
    const leave = await applyForLeave(institutionA, adminAuth, adminUserId, {
      applicantType: "student", applicantId: student1, startDate: "2026-09-01", endDate: "2026-09-02", reason: "Portal test",
    });
    const forStudent1 = await listLeaveApplicationsForStudent(institutionA, adminAuth, student1);
    expect(forStudent1.some((l) => l.id === leave.id)).toBe(true);

    const forStudent2 = await listLeaveApplicationsForStudent(institutionA, adminAuth, student2);
    expect(forStudent2.some((l) => l.id === leave.id)).toBe(false);
  });
});

describe("Portal tenant isolation (§E, extended to migration 0014)", () => {
  it("Institution B cannot see Institution A's parents or student_parents links", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@portal-b.example", "Portal B Admin");

    expect(await listParents(institutionB, adminB.authUserId)).toHaveLength(0);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from student_parents where student_id = $1", [student1]);
      expect(rows.rows).toHaveLength(0);
    });
  });
});
