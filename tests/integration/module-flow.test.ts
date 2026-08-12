/**
 * PROMPT EDU ERP — Module assignment flow (§I "module configuration", §W
 * Super Admin per-institution controls). Proves: default-enabled semantics
 * (no institution_modules row = enabled), a Super Admin can disable/
 * re-enable an optional module for one institution without affecting
 * others, core modules can never be disabled, non-super-admins are
 * rejected, and getEnabledModuleCodes()/requireModuleEnabled() (what the
 * (institution) layout and optional-module pages actually call) reflect
 * exactly what the Super Admin set.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser, seedSuperAdminUser } from "../../database/scripts/seed";
import {
  listInstitutionModuleStatus, setInstitutionModuleEnabled, getEnabledModuleCodes, requireModuleEnabled,
} from "../../services/modules/module-service";

let institutionA: string, institutionB: string;
let superAdminAuth: string;
let adminAuthA: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "mod-school-a");
  institutionB = await seedDemoInstitution(db, "mod-school-b");

  const adminA = await seedDemoUser(db, institutionA, "admin@mod-a.example", "Mod School A Admin", "institution_admin");
  adminAuthA = adminA.authUserId;

  const superAdmin = await seedSuperAdminUser(db, institutionA, "root-mod@prompt-innovations.example", "Platform Root");
  superAdminAuth = superAdmin.authUserId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("default-enabled semantics", () => {
  it("every catalog module is enabled by default with no institution_modules row written yet", async () => {
    const enabled = await getEnabledModuleCodes(institutionA, adminAuthA);
    expect(enabled.has("examination")).toBe(true);
    expect(enabled.has("attendance")).toBe(true);
    expect(enabled.has("library")).toBe(true);
    expect(enabled.has("academic")).toBe(true); // core
    expect(enabled.has("students")).toBe(true); // core
  });

  it("requireModuleEnabled does not throw for a not-yet-touched (therefore enabled) module", async () => {
    await expect(requireModuleEnabled(institutionA, adminAuthA, "staff")).resolves.toBeUndefined();
  });
});

describe("access control", () => {
  it("a non-super-admin cannot list or change module status for any institution", async () => {
    await expect(listInstitutionModuleStatus(adminAuthA, institutionA)).rejects.toThrow(/Forbidden/);
    await expect(setInstitutionModuleEnabled(adminAuthA, institutionA, { moduleCode: "library", enabled: false })).rejects.toThrow(/Forbidden/);
  });
});

describe("Super Admin disables a module for one institution", () => {
  it("disabling 'library' for institution A removes it from A's enabled set but not B's", async () => {
    await setInstitutionModuleEnabled(superAdminAuth, institutionA, { moduleCode: "library", enabled: false });

    const enabledA = await getEnabledModuleCodes(institutionA, adminAuthA);
    expect(enabledA.has("library")).toBe(false);

    const enabledB = await getEnabledModuleCodes(institutionB, superAdminAuth);
    expect(enabledB.has("library")).toBe(true);
  });

  it("requireModuleEnabled now throws MODULE_DISABLED for the disabled module", async () => {
    await expect(requireModuleEnabled(institutionA, adminAuthA, "library")).rejects.toThrow(/MODULE_DISABLED:library/);
  });

  it("listInstitutionModuleStatus reflects the disabled state for A", async () => {
    const statuses = await listInstitutionModuleStatus(superAdminAuth, institutionA);
    const library = statuses.find((m) => m.code === "library");
    expect(library?.isEnabled).toBe(false);
    expect(library?.isCore).toBe(false);
  });

  it("re-enabling restores it", async () => {
    await setInstitutionModuleEnabled(superAdminAuth, institutionA, { moduleCode: "library", enabled: true });
    const enabled = await getEnabledModuleCodes(institutionA, adminAuthA);
    expect(enabled.has("library")).toBe(true);
  });
});

describe("core modules cannot be disabled", () => {
  it("rejects an attempt to disable 'academic'", async () => {
    await expect(
      setInstitutionModuleEnabled(superAdminAuth, institutionA, { moduleCode: "academic", enabled: false })
    ).rejects.toThrow(/core module/);
  });

  it("rejects an attempt to disable 'students'", async () => {
    await expect(
      setInstitutionModuleEnabled(superAdminAuth, institutionA, { moduleCode: "students", enabled: false })
    ).rejects.toThrow(/core module/);
  });
});

describe("unknown module code", () => {
  it("rejects with a clear error rather than a raw DB error leak", async () => {
    await expect(
      setInstitutionModuleEnabled(superAdminAuth, institutionA, { moduleCode: "not-a-real-module", enabled: false })
    ).rejects.toThrow(/Unknown module/);
  });
});
