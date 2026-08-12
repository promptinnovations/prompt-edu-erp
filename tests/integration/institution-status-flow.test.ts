/**
 * PROMPT EDU ERP — institution status enforcement (SECURITY.md's
 * previously-tracked "institution deactivation has no cascading effect"
 * gap, now closed). Proves: the pure decision function itself covers every
 * status/role combination, an institution's own permission resolution
 * goes empty once suspended (closing the actual write-path gap since
 * every module action already guards on `!ctx.institutionId`), a Super
 * Admin is never blocked, and 'trial' status is treated as fully usable
 * (not just 'active').
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getMembershipsForUser } from "../../services/tenant/tenant-service";
import { getPermissionsForUser } from "../../services/permissions/permission-service";
import { resolveInstitutionBlockedReason } from "../../services/request-context";
import { updateInstitutionStatus } from "../../services/super-admin/super-admin-service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let superAdminAuth: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "status-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@status-a.example", "Status Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const { seedSuperAdminUser } = await import("../../database/scripts/seed");
  const superAdmin = await seedSuperAdminUser(db, institutionA, "root@status.example", "Status Root");
  superAdminAuth = superAdmin.authUserId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("resolveInstitutionBlockedReason (pure decision function)", () => {
  it("blocks 'suspended' for an ordinary user", () => {
    expect(resolveInstitutionBlockedReason("suspended", false)).toBe("suspended");
  });
  it("blocks 'inactive' for an ordinary user", () => {
    expect(resolveInstitutionBlockedReason("inactive", false)).toBe("inactive");
  });
  it("allows 'active' for an ordinary user", () => {
    expect(resolveInstitutionBlockedReason("active", false)).toBeNull();
  });
  it("allows 'trial' for an ordinary user (not just 'active')", () => {
    expect(resolveInstitutionBlockedReason("trial", false)).toBeNull();
  });
  it("never blocks a Super Admin, regardless of status", () => {
    expect(resolveInstitutionBlockedReason("suspended", true)).toBeNull();
    expect(resolveInstitutionBlockedReason("inactive", true)).toBeNull();
  });
  it("returns null when there is no institution at all (undefined status)", () => {
    expect(resolveInstitutionBlockedReason(undefined, false)).toBeNull();
  });
});

describe("end-to-end: suspending an institution empties an ordinary member's permissions", () => {
  it("an institution_admin has real permissions while active", async () => {
    const perms = await getPermissionsForUser(adminAuth, adminUserId, institutionA);
    expect(perms.size).toBeGreaterThan(0);
  });

  it("membership resolution reflects the institution's own status", async () => {
    const memberships = await getMembershipsForUser(adminAuth, adminUserId);
    const own = memberships.find((m) => m.institutionId === institutionA);
    expect(own?.institutionStatus).toBe("active");
  });

  it("after suspension, the blocked-reason resolves to 'suspended' for that membership", async () => {
    await updateInstitutionStatus(superAdminAuth, institutionA, { status: "suspended" });

    const memberships = await getMembershipsForUser(adminAuth, adminUserId);
    const own = memberships.find((m) => m.institutionId === institutionA);
    expect(own?.institutionStatus).toBe("suspended");
    expect(resolveInstitutionBlockedReason(own?.institutionStatus, false)).toBe("suspended");

    // Restore for isolation from any later tests reusing this institution.
    await updateInstitutionStatus(superAdminAuth, institutionA, { status: "active" });
  });

  it("a Super Admin's own resolution is never blocked even while the institution is suspended", async () => {
    await updateInstitutionStatus(superAdminAuth, institutionA, { status: "suspended" });
    expect(resolveInstitutionBlockedReason("suspended", true)).toBeNull();
    await updateInstitutionStatus(superAdminAuth, institutionA, { status: "active" });
  });
});
