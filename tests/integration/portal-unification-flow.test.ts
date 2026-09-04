/**
 * PROMPT EDU ERP — Phase D §3 "Parent and Student Portal Shall be with the
 * same credential" — linkExistingParentAccountToStudent() /
 * linkExistingStudentAccountToParent() reuse one login for both roles.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent, createParent, linkParentToStudent } from "../../modules/students/service";
import {
  provisionParentPortalAccount, provisionStudentPortalAccount,
  linkExistingParentAccountToStudent, linkExistingStudentAccountToParent,
  getOwnStudentId, getOwnParentId, resolvePortalDestination,
} from "../../modules/portal/service";
import { getRoleCodesForUser } from "../../services/permissions/permission-service";

let institutionA: string;
let adminAuth: string, adminUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "portal-unify-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@portal-unify-a.example", "Unify Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Same-credential portal unification (§3)", () => {
  it("linkExistingParentAccountToStudent() lets a parent's existing login also become their child's login", async () => {
    const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PU-1", fullName: "Unify Student One" });
    const parent = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Unify Parent One", email: "unify.parent1@example.com" });
    await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: student.id, parentId: parent.id, isPrimaryContact: true });

    const { userId: parentUserId } = await provisionParentPortalAccount(institutionA, adminAuth, adminUserId, {
      parentId: parent.id, email: "unify.parent1.login@example.com", fullName: "Unify Parent One",
    });

    const { userId: linkedUserId } = await linkExistingParentAccountToStudent(institutionA, adminAuth, adminUserId, {
      parentId: parent.id, studentId: student.id,
    });
    expect(linkedUserId).toBe(parentUserId);

    // Same login now resolves BOTH a student id and a parent id.
    const ownStudentId = await getOwnStudentId(institutionA, adminAuth, parentUserId);
    const ownParentId = await getOwnParentId(institutionA, adminAuth, parentUserId);
    expect(ownStudentId).toBe(student.id);
    expect(ownParentId).toBe(parent.id);

    // And holds both roles -> resolvePortalDestination defaults to parent.
    const roleCodes = await getRoleCodesForUser(adminAuth, parentUserId, institutionA);
    expect(roleCodes.has("student")).toBe(true);
    expect(roleCodes.has("parent")).toBe(true);
    expect(resolvePortalDestination(roleCodes)).toBe("parent");
  });

  it("linkExistingParentAccountToStudent() refuses when the student already has a different account", async () => {
    const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PU-2", fullName: "Unify Student Two" });
    const parent = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Unify Parent Two", email: "unify.parent2@example.com" });
    await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: student.id, parentId: parent.id, isPrimaryContact: false });
    await provisionStudentPortalAccount(institutionA, adminAuth, adminUserId, { studentId: student.id, email: "unify.student2.login@example.com", fullName: "Unify Student Two" });
    await provisionParentPortalAccount(institutionA, adminAuth, adminUserId, { parentId: parent.id, email: "unify.parent2.login@example.com", fullName: "Unify Parent Two" });

    await expect(
      linkExistingParentAccountToStudent(institutionA, adminAuth, adminUserId, { parentId: parent.id, studentId: student.id })
    ).rejects.toThrow(/already has a portal account/);
  });

  it("linkExistingParentAccountToStudent() refuses an unrelated parent/student pair", async () => {
    const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PU-3", fullName: "Unify Student Three" });
    const unrelatedParent = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Unrelated Parent", email: "unrelated@example.com" });
    await provisionParentPortalAccount(institutionA, adminAuth, adminUserId, { parentId: unrelatedParent.id, email: "unrelated.login@example.com", fullName: "Unrelated Parent" });

    await expect(
      linkExistingParentAccountToStudent(institutionA, adminAuth, adminUserId, { parentId: unrelatedParent.id, studentId: student.id })
    ).rejects.toThrow(/aren't linked as family/);
  });

  it("linkExistingStudentAccountToParent() is the reverse direction", async () => {
    const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PU-4", fullName: "Unify Student Four" });
    const parent = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Unify Parent Four" });
    await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: student.id, parentId: parent.id, isPrimaryContact: false });

    const { userId: studentUserId } = await provisionStudentPortalAccount(institutionA, adminAuth, adminUserId, {
      studentId: student.id, email: "unify.student4.login@example.com", fullName: "Unify Student Four",
    });

    const { userId: linkedUserId } = await linkExistingStudentAccountToParent(institutionA, adminAuth, adminUserId, {
      studentId: student.id, parentId: parent.id,
    });
    expect(linkedUserId).toBe(studentUserId);

    const ownParentId = await getOwnParentId(institutionA, adminAuth, studentUserId);
    expect(ownParentId).toBe(parent.id);
  });
});
