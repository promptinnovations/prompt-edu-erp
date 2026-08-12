/**
 * PROMPT EDU ERP — Phase 0 exit-criterion flow, exercised through the REAL
 * service layer (TenantService, PermissionService, module services), not
 * raw SQL — proving ARCHITECTURE.md §AA.1's flow works end to end:
 *   Login → Institution context → Dashboard → Create class → Create section
 *   → Create subject → Create student (non-English name) → View student
 * with a second institution proving isolation at the service layer too.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
// PGLITE_DATA_DIR must be set BEFORE services/db/client.ts's getDbClient()
// is first called (it reads the env var lazily inside the function, so
// setting it here, before any of the imports below execute their top-level
// code, is sufficient — none of these modules call getDbClient() at import
// time).
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser, seedSuperAdminUser } from "../../database/scripts/seed";
import { resolveUserByAuthId, resolveActiveInstitution, linkOrResolveAuthenticatedUser } from "../../services/tenant/tenant-service";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createClass, createSection, createSubject, listClasses } from "../../modules/academic/service";
import { createStudent, getStudent, listStudents } from "../../modules/students/service";

let institutionA: string;
let institutionB: string;
let adminAAuth: string;
let adminAUserId: string;
let adminBAuth: string;
let adminBUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "school-a");
  institutionB = await seedDemoInstitution(db, "school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@school-a.example", "School A Admin");
  adminAAuth = admin.authUserId;
  adminAUserId = admin.userId;

  // A second institution's own admin, to prove per-service isolation too.
  const adminB = await seedDemoUser(db, institutionB, "admin@school-b.example", "School B Admin");
  adminBAuth = adminB.authUserId;
  adminBUserId = adminB.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Phase 0 exit-criterion flow (§AA.1), via the service layer", () => {
  it("resolves the authenticated user and their active institution (§B.3)", async () => {
    const resolved = await resolveUserByAuthId(adminAAuth);
    expect(resolved?.userId).toBe(adminAUserId);
    expect(resolved?.isSuperAdmin).toBe(false);

    const active = await resolveActiveInstitution(adminAAuth, adminAUserId, "school-a");
    expect(active?.institutionId).toBe(institutionA);
  });

  it("grants the institution_admin role the expected permissions (§F.4)", async () => {
    const perms = await getPermissionsForUser(adminAAuth, adminAUserId, institutionA);
    expect(perms.has("student.create")).toBe(true);
    expect(perms.has("marks.approve")).toBe(true);
    expect(perms.has("platform.institutions.manage")).toBe(false); // Super-Admin-only, correctly excluded
  });

  it("runs Create class → Create section → Create subject → Create student → View student", async () => {
    const perms = await getPermissionsForUser(adminAAuth, adminAUserId, institutionA);
    requirePermission(perms, "settings.manage"); // stands in for a module-management permission check

    const cls = await createClass(institutionA, adminAAuth, adminAUserId, { name: "Grade 5", sortOrder: 1 });
    expect(cls.name).toBe("Grade 5");

    const section = await createSection(institutionA, adminAAuth, adminAUserId, { classId: cls.id, name: "A" });
    expect(section.class_id).toBe(cls.id);

    const subject = await createSubject(institutionA, adminAAuth, adminAUserId, { name: "Arabic Language" });
    expect(subject.name).toBe("Arabic Language");

    requirePermission(perms, "student.create");
    // Non-English (Malayalam) name — proves Unicode data entry works regardless
    // of the English-only v1 UI language (§S.1/§S.3).
    const student = await createStudent(institutionA, adminAAuth, adminAUserId, {
      admissionNumber: "A-1001",
      fullName: "മുഹമ്മദ് അലി",
    });
    expect(student.full_name).toBe("മുഹമ്മദ് അലി");

    const fetched = await getStudent(institutionA, adminAAuth, student.id);
    expect(fetched?.id).toBe(student.id);
    expect(fetched?.admission_number).toBe("A-1001");
  });

  it("Institution A's class/student lists never include Institution B's data, even via the service layer", async () => {
    await createClass(institutionB, adminBAuth, adminBUserId, { name: "Grade 5 (School B)", sortOrder: 0 });
    await createStudent(institutionB, adminBAuth, adminBUserId, {
      admissionNumber: "B-1001",
      fullName: "Fatima Noor",
    });

    const classesA = await listClasses(institutionA, adminAAuth);
    expect(classesA.map((c) => c.name)).not.toContain("Grade 5 (School B)");

    const studentsA = await listStudents(institutionA, adminAAuth);
    expect(studentsA.find((s) => s.admission_number === "B-1001")).toBeUndefined();
  });

  it("throws Forbidden when a permission the role doesn't hold is required", async () => {
    const perms = await getPermissionsForUser(adminAAuth, adminAUserId, institutionA);
    expect(() => requirePermission(perms, "platform.institutions.manage")).toThrow(/Forbidden/);
  });
});

describe("seedDemoUser()/seedSuperAdminUser() with claimable: true (real-Supabase bootstrap, §AA follow-up)", () => {
  it("leaves auth_user_id NULL, and a real first sign-in claims it via linkOrResolveAuthenticatedUser()", async () => {
    const db = await getDbClient();
    const seeded = await seedDemoUser(db, institutionA, "claimable-admin@school-a.example", "Claimable Admin", "institution_admin", true);
    expect(seeded.authUserId).toBeNull();

    // Nothing to resolve yet — no real auth identity has signed in.
    expect(await resolveUserByAuthId(crypto.randomUUID())).toBeNull();

    // The first real sign-in with the SAME email claims this exact row —
    // this is the actual mechanism a fresh deployment relies on.
    const freshRealAuthId = crypto.randomUUID();
    const resolved = await linkOrResolveAuthenticatedUser(freshRealAuthId, "claimable-admin@school-a.example");
    expect(resolved.userId).toBe(seeded.userId);

    const direct = await resolveUserByAuthId(freshRealAuthId);
    expect(direct?.userId).toBe(seeded.userId);
  });

  it("does the same for seedSuperAdminUser()", async () => {
    const db = await getDbClient();
    const seeded = await seedSuperAdminUser(db, institutionA, "claimable-root@prompt-innovations.example", "Claimable Root", true);
    expect(seeded.authUserId).toBeNull();

    const freshRealAuthId = crypto.randomUUID();
    const resolved = await linkOrResolveAuthenticatedUser(freshRealAuthId, "claimable-root@prompt-innovations.example");
    expect(resolved.userId).toBe(seeded.userId);
    expect(resolved.isSuperAdmin).toBe(true);
  });

  it("re-running seedDemoUser() on an already-claimed email never resets auth_user_id back to NULL", async () => {
    const db = await getDbClient();
    const first = await seedDemoUser(db, institutionA, "reseed-test@school-a.example", "Reseed Test", "institution_admin", true);
    expect(first.authUserId).toBeNull();

    const realAuthId = crypto.randomUUID();
    await linkOrResolveAuthenticatedUser(realAuthId, "reseed-test@school-a.example");

    // Re-running seed (e.g. re-deploying) against the same database must
    // NOT touch this now-real link — only full_name should change.
    await seedDemoUser(db, institutionA, "reseed-test@school-a.example", "Reseed Test Renamed", "institution_admin", true);
    const stillLinked = await resolveUserByAuthId(realAuthId);
    expect(stillLinked?.userId).toBe(first.userId);
  });
});
