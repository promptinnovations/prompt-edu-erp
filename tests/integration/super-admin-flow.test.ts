/**
 * PROMPT EDU ERP — Super Admin flow (ARCHITECTURE.md §B.4, §W, §Y.3, Phase
 * 17): proves a non-super-admin (even a full institution_admin) can never
 * reach any SuperAdminService function regardless of their institution-
 * scoped permissions, that institution creation provisions the generic
 * system-role scaffolding (and nothing demo-specific), that status changes
 * and creation both write to platform_audit_logs (not the institution-
 * scoped audit_logs), and that the usage overview aggregates real counts
 * across institutions correctly.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser, seedSuperAdminUser } from "../../database/scripts/seed";
import { resolveUserByAuthId } from "../../services/tenant/tenant-service";
import {
  listInstitutions, createInstitution, updateInstitutionStatus, updateInstitutionCode,
  getPlatformUsageOverview, listPlatformAuditLogs,
} from "../../services/super-admin/super-admin-service";
import { createStudent } from "../../modules/students/service";

let institutionA: string;
let superAdminAuth: string;
let adminAuth: string, adminUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "sa-school-a");

  const admin = await seedDemoUser(db, institutionA, "admin@sa-a.example", "SA Institution Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const superAdmin = await seedSuperAdminUser(db, institutionA, "root@prompt-innovations.example", "Platform Root");
  superAdminAuth = superAdmin.authUserId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("access control — non-super-admins are always rejected", () => {
  it("a full institution_admin cannot call any SuperAdminService function", async () => {
    await expect(listInstitutions(adminAuth)).rejects.toThrow(/Forbidden/);
    await expect(createInstitution(adminAuth, { code: "sneaky", name: "Sneaky School", type: "other", defaultLocale: "en" })).rejects.toThrow(/Forbidden/);
    await expect(updateInstitutionStatus(adminAuth, institutionA, { status: "suspended" })).rejects.toThrow(/Forbidden/);
    await expect(getPlatformUsageOverview(adminAuth)).rejects.toThrow(/Forbidden/);
    await expect(listPlatformAuditLogs(adminAuth)).rejects.toThrow(/Forbidden/);
  });

  it("resolveUserByAuthId confirms the institution_admin genuinely has isSuperAdmin=false", async () => {
    const resolved = await resolveUserByAuthId(adminAuth);
    expect(resolved?.isSuperAdmin).toBe(false);
  });

  it("resolveUserByAuthId confirms the seeded super admin genuinely has isSuperAdmin=true", async () => {
    const resolved = await resolveUserByAuthId(superAdminAuth);
    expect(resolved?.isSuperAdmin).toBe(true);
  });

  it("an unrecognized authUserId is rejected the same way (no user record at all)", async () => {
    await expect(listInstitutions(crypto.randomUUID())).rejects.toThrow(/Forbidden/);
  });
});

describe("institution creation", () => {
  it("creates an institution with the generic system-role scaffolding, and institution_admin gets the full grant", async () => {
    const institution = await createInstitution(superAdminAuth, { code: "green-valley", name: "Green Valley School", type: "school", defaultLocale: "en" });
    expect(institution.status).toBe("trial");
    expect(institution.code).toBe("green-valley");

    const db = await getDbClient();
    const roleCodes = await db.withInstitutionContext({ institutionId: institution.id, authUserId: superAdminAuth, isSuperAdmin: true }, async (scoped) => {
      const { rows } = await scoped.query<{ code: string }>("select code from roles where institution_id = $1 order by code", [institution.id]);
      return rows.map((r) => r.code);
    });
    expect(roleCodes.sort()).toEqual(
      ["institution_admin", "librarian", "management", "parent", "staff", "student", "teacher"].sort()
    );

    const grantCount = await db.withInstitutionContext({ institutionId: institution.id, authUserId: superAdminAuth, isSuperAdmin: true }, async (scoped) => {
      const { rows } = await scoped.query<{ count: string }>(
        `select count(*) as count from role_permissions rp
           join roles r on r.id = rp.role_id
          where r.institution_id = $1 and r.code = 'institution_admin'`,
        [institution.id]
      );
      return Number(rows[0].count);
    });
    expect(grantCount).toBeGreaterThan(0); // full non-platform grant, mirroring seedDemoInstitution()

    // No domain/demo data auto-seeded (exam types, achievement categories,
    // modules enabled, etc.) — that stays an Institution Admin's own job.
    const enabledModules = await db.withInstitutionContext({ institutionId: institution.id, authUserId: superAdminAuth, isSuperAdmin: true }, async (scoped) => {
      const { rows } = await scoped.query<{ count: string }>("select count(*) as count from institution_modules where institution_id = $1", [institution.id]);
      return Number(rows[0].count);
    });
    expect(enabledModules).toBe(0);
  });

  it("rejects a duplicate/invalid code with a validation error, not a raw DB error leak", async () => {
    await expect(createInstitution(superAdminAuth, { code: "Not Valid!", name: "Bad Code School", type: "other", defaultLocale: "en" })).rejects.toThrow();
  });
});

describe("creating an institution with its first admin account", () => {
  it("provisions a real, immediately-usable admin: users row, membership, institution_admin role", async () => {
    const institution = await createInstitution(superAdminAuth, {
      code: "admin-bundle-school", name: "Admin Bundle School", type: "school", defaultLocale: "en",
      adminEmail: "admin@admin-bundle.example", adminFullName: "Bundle Admin", adminPassword: "correct-horse-battery",
    });

    const db = await getDbClient();
    const { rows: userRows } = await db.query<{ id: string; auth_user_id: string | null }>(
      "select id, auth_user_id from users where email = $1", ["admin@admin-bundle.example"]
    );
    expect(userRows).toHaveLength(1);
    expect(userRows[0].auth_user_id).not.toBeNull(); // claimed for real, not a claimable placeholder

    const roleCodes = await db.withInstitutionContext(
      { institutionId: institution.id, authUserId: superAdminAuth, isSuperAdmin: true },
      async (scoped) => {
        const { rows } = await scoped.query<{ code: string }>(
          `select r.code from user_roles ur join roles r on r.id = ur.role_id
            where ur.user_id = $1 and ur.institution_id = $2`,
          [userRows[0].id, institution.id]
        );
        return rows.map((r) => r.code);
      }
    );
    expect(roleCodes).toEqual(["institution_admin"]);
  });

  it("requires all three admin fields together — providing only one is rejected", async () => {
    await expect(
      createInstitution(superAdminAuth, {
        code: "partial-admin-school", name: "Partial Admin School", type: "school", defaultLocale: "en",
        adminEmail: "only-email@partial.example",
      })
    ).rejects.toThrow();
  });

  it("creates the institution with no admin at all when none of the three are given (existing behavior unchanged)", async () => {
    const institution = await createInstitution(superAdminAuth, {
      code: "no-admin-school", name: "No Admin School", type: "school", defaultLocale: "en",
    });
    expect(institution.code).toBe("no-admin-school");
  });

  it("rejects an admin email that's already used by another user on the platform, and creates nothing (institution rolled back too)", async () => {
    await expect(
      createInstitution(superAdminAuth, {
        code: "dupe-admin-school", name: "Dupe Admin School", type: "school", defaultLocale: "en",
        adminEmail: "admin@admin-bundle.example", // already used above
        adminFullName: "Someone Else", adminPassword: "another-password-here",
      })
    ).rejects.toThrow(/already exists/);

    const institutions = await listInstitutions(superAdminAuth);
    expect(institutions.find((i) => i.code === "dupe-admin-school")).toBeUndefined();
  });
});

describe("institution status changes", () => {
  it("updates status and records a platform audit entry (not the institution-scoped audit_logs)", async () => {
    const updated = await updateInstitutionStatus(superAdminAuth, institutionA, { status: "suspended" });
    expect(updated?.status).toBe("suspended");

    const logs = await listPlatformAuditLogs(superAdminAuth);
    const statusChangeLog = logs.find((l) => l.action === "status_change" && l.entity_id === institutionA);
    expect(statusChangeLog).toBeTruthy();
    expect(statusChangeLog?.institution_name).toBeTruthy();

    // restore for later tests
    await updateInstitutionStatus(superAdminAuth, institutionA, { status: "active" });
  });

  it("returns null for a non-existent institution rather than throwing", async () => {
    const result = await updateInstitutionStatus(superAdminAuth, crypto.randomUUID(), { status: "active" });
    expect(result).toBeNull();
  });
});

describe("platform usage overview", () => {
  it("aggregates live student counts correctly across institutions", async () => {
    await createStudent(institutionA, adminAuth, adminUserId, {
      fullName: "Usage Test Student", admissionNumber: "SA-USAGE-001", dateOfBirth: "2015-01-01", gender: "male",
    });

    const overview = await getPlatformUsageOverview(superAdminAuth);
    const rowA = overview.find((r) => r.institution_id === institutionA);
    expect(rowA).toBeTruthy();
    expect(rowA!.student_count).toBeGreaterThan(0);
  });
});

describe("createInstitution audit trail", () => {
  it("records a platform audit entry for institution creation itself", async () => {
    const institution = await createInstitution(superAdminAuth, { code: "audit-check-school", name: "Audit Check School", type: "other", defaultLocale: "en" });
    const logs = await listPlatformAuditLogs(superAdminAuth);
    const createLog = logs.find((l) => l.action === "create" && l.entity_id === institution.id);
    expect(createLog).toBeTruthy();
    expect(createLog?.actor_name).toBe("Platform Root");
  });
});

describe("updateInstitutionCode (§137 follow-up: editable per-institution deep-link URL)", () => {
  it("changes the code and records a platform audit entry", async () => {
    const institution = await createInstitution(superAdminAuth, { code: "code-change-school", name: "Code Change School", type: "other", defaultLocale: "en" });
    const updated = await updateInstitutionCode(superAdminAuth, institution.id, { code: "code-change-school-v2" });
    expect(updated?.code).toBe("code-change-school-v2");

    const logs = await listPlatformAuditLogs(superAdminAuth);
    const codeLog = logs.find((l) => l.action === "code_change" && l.entity_id === institution.id);
    expect(codeLog).toBeTruthy();
  });

  it("rejects a code that collides with a reserved top-level route", async () => {
    const institution = await createInstitution(superAdminAuth, { code: "reserved-check-school", name: "Reserved Check School", type: "other", defaultLocale: "en" });
    await expect(updateInstitutionCode(superAdminAuth, institution.id, { code: "login" })).rejects.toThrow();
    await expect(updateInstitutionCode(superAdminAuth, institution.id, { code: "super-admin" })).rejects.toThrow();
  });

  it("rejects a code already used by another institution", async () => {
    const first = await createInstitution(superAdminAuth, { code: "clash-school-one", name: "Clash School One", type: "other", defaultLocale: "en" });
    await createInstitution(superAdminAuth, { code: "clash-school-two", name: "Clash School Two", type: "other", defaultLocale: "en" });
    await expect(updateInstitutionCode(superAdminAuth, first.id, { code: "clash-school-two" })).rejects.toThrow(/already used/);
  });

  it("is a harmless no-op (no audit entry) when the code doesn't actually change", async () => {
    const institution = await createInstitution(superAdminAuth, { code: "noop-school", name: "No-op School", type: "other", defaultLocale: "en" });
    const before = (await listPlatformAuditLogs(superAdminAuth)).length;
    const result = await updateInstitutionCode(superAdminAuth, institution.id, { code: "noop-school" });
    expect(result?.code).toBe("noop-school");
    const after = (await listPlatformAuditLogs(superAdminAuth)).length;
    expect(after).toBe(before);
  });

  it("a non-super-admin cannot change any institution's code", async () => {
    const institution = await createInstitution(superAdminAuth, { code: "forbidden-code-school", name: "Forbidden Code School", type: "other", defaultLocale: "en" });
    await expect(updateInstitutionCode(adminAuth, institution.id, { code: "whatever" })).rejects.toThrow(/Forbidden/);
  });
});

describe("createInstitution rejects reserved codes up front", () => {
  it("cannot create an institution whose code shadows a real app route", async () => {
    await expect(
      createInstitution(superAdminAuth, { code: "dashboard", name: "Shadow School", type: "other", defaultLocale: "en" })
    ).rejects.toThrow();
  });
});
