/**
 * PROMPT EDU ERP — Super Admin "view/operate any institution" flow
 * (services/request-context.ts's viewingInstitutionAsSuperAdmin). A "pure"
 * Super Admin has no user_institution_memberships row anywhere (§B.4), so
 * getRequestContext() itself can't be unit-tested directly here (it needs
 * next/headers' cookies(), a real Next.js request) — instead this proves
 * the two things that design actually rests on:
 *
 *   1. getAllInstitutionPermissionCodes() returns every institution-scoped
 *      permission (what a Super Admin viewing an institution is granted,
 *      since they have no role row of their own to derive permissions
 *      from) and excludes platform/super_admin-only codes.
 *   2. The RLS assumption itself: a scoped connection opened with ONLY
 *      { institutionId, authUserId } (no isSuperAdmin flag) can fully
 *      read/write that institution's data even when the connecting
 *      identity has no membership row there at all — because every
 *      tenant_isolation policy checks institution_id equality, not
 *      membership. This is what makes the Super Admin's "Open this
 *      institution's console" button work with zero changes to any
 *      existing institution-scoped service function.
 *   3. getInstitutionForSuperAdmin() — used to validate the view-override
 *      cookie before honoring it — rejects non-super-admins and returns
 *      null (not a throw) for an unknown id.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser, seedSuperAdminUser } from "../../database/scripts/seed";
import { getAllInstitutionPermissionCodes } from "../../services/permissions/permission-service";
import { getInstitutionForSuperAdmin } from "../../services/super-admin/super-admin-service";
import { createStudent, listStudents } from "../../modules/students/service";

let institutionX: string, institutionY: string;
let superAdminAuth: string, superAdminUserId: string;
let regularAdminAuth: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionX = await seedDemoInstitution(db, "sav-school-x");
  institutionY = await seedDemoInstitution(db, "sav-school-y");

  const regularAdmin = await seedDemoUser(db, institutionX, "admin@sav-x.example", "SAV Institution Admin", "institution_admin");
  regularAdminAuth = regularAdmin.authUserId;

  const superAdmin = await seedSuperAdminUser(db, institutionX, "root-sav@prompt-innovations.example", "Platform Root");
  superAdminAuth = superAdmin.authUserId;
  superAdminUserId = superAdmin.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("getAllInstitutionPermissionCodes", () => {
  it("includes ordinary institution-scoped permissions", async () => {
    const codes = await getAllInstitutionPermissionCodes();
    expect(codes.has("users.manage")).toBe(true);
    expect(codes.has("roles.manage")).toBe(true);
    expect(codes.has("staff.create")).toBe(true);
    expect(codes.has("student.create")).toBe(true);
  });

  it("excludes platform/super_admin-module-only codes", async () => {
    const codes = await getAllInstitutionPermissionCodes();
    expect(codes.has("platform.institutions.manage")).toBe(false);
    expect(codes.has("platform.usage.view")).toBe(false);
    expect(codes.has("platform.audit.view")).toBe(false);
  });
});

describe("getInstitutionForSuperAdmin", () => {
  it("returns the institution for a valid id", async () => {
    const institution = await getInstitutionForSuperAdmin(superAdminAuth, institutionX);
    expect(institution?.code).toBe("sav-school-x");
  });

  it("returns null (not a throw) for an unknown id", async () => {
    const institution = await getInstitutionForSuperAdmin(superAdminAuth, crypto.randomUUID());
    expect(institution).toBeNull();
  });

  it("rejects a non-super-admin caller", async () => {
    await expect(getInstitutionForSuperAdmin(regularAdminAuth, institutionX)).rejects.toThrow(/Forbidden/);
  });
});

describe("a super admin with no membership can fully operate institution X via institutionId scoping alone", () => {
  it("creates a real student in X using only { institutionId: X, authUserId: superAdminAuth } — no isSuperAdmin flag needed", async () => {
    const student = await createStudent(institutionX, superAdminAuth, superAdminUserId, {
      fullName: "Super Admin Created Student", admissionNumber: "SAV-X-001", dateOfBirth: "2015-01-01", gender: "male",
    });
    expect(student.full_name).toBe("Super Admin Created Student");

    const students = await listStudents(institutionX, superAdminAuth);
    expect(students.some((s) => s.admission_number === "SAV-X-001")).toBe(true);
  });

  it("that same student is invisible when scoped to institution Y instead — proves this is institution_id-gated, not a blanket bypass", async () => {
    const studentsInY = await listStudents(institutionY, superAdminAuth);
    expect(studentsInY.some((s) => s.admission_number === "SAV-X-001")).toBe(false);
  });
});
