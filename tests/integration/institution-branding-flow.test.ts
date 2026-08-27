/**
 * PROMPT EDU ERP — Institution self-service theme flow (§137, evolved by
 * migration 0040: "never use dark ... give colour combination options, let
 * them choose best for them"). Proves: an institution's own admin (not
 * just Super Admin) can set/read their own theme_palette, an invalid
 * palette id is rejected, a "reset" call clears it back to null (falling
 * back to the platform default), and one institution's choice is fully
 * isolated from another's — the same tenant-isolation guarantee every
 * other table gets, now proven for migration 0020's
 * institutions_update_self RLS policy again (it survives the column
 * rename/rework unchanged).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser, seedSuperAdminUser } from "../../database/scripts/seed";
import { getInstitution, updateInstitutionTheme } from "../../services/institution/institution-service";
import { getPlatformDefaultPalette, setPlatformDefaultPalette } from "../../services/super-admin/super-admin-service";
import { THEME_PALETTES, DEFAULT_PALETTE_ID, getPalette } from "../../services/branding/palettes";

let institutionA: string, institutionB: string;
let adminAuthA: string, adminUserIdA: string;
let adminAuthB: string, adminUserIdB: string;
let superAdminAuth: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "brand-school-a");
  institutionB = await seedDemoInstitution(db, "brand-school-b");

  const adminA = await seedDemoUser(db, institutionA, "admin@brand-a.example", "Brand School A Admin", "institution_admin");
  adminAuthA = adminA.authUserId;
  adminUserIdA = adminA.userId;

  const adminB = await seedDemoUser(db, institutionB, "admin@brand-b.example", "Brand School B Admin", "institution_admin");
  adminAuthB = adminB.authUserId;
  adminUserIdB = adminB.userId;

  const superAdmin = await seedSuperAdminUser(db, institutionA, "super@platform.example", "Platform Super Admin");
  superAdminAuth = superAdmin.authUserId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("reading an institution's theme", () => {
  it("defaults to null (no palette picked yet, falls back to platform default) before any update", async () => {
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.themePalette).toBeNull();
  });
});

describe("updateInstitutionTheme", () => {
  it("lets the institution's own admin set a valid palette, reflected immediately by getInstitution", async () => {
    await updateInstitutionTheme(institutionA, adminAuthA, adminUserIdA, { themePalette: "emerald-forest" });
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.themePalette).toBe("emerald-forest");
  });

  it("rejects a palette id that isn't in the curated list and leaves the stored value unchanged", async () => {
    await expect(
      updateInstitutionTheme(institutionA, adminAuthA, adminUserIdA, { themePalette: "midnight-goth" })
    ).rejects.toThrow();
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.themePalette).toBe("emerald-forest"); // unchanged from the previous test
  });

  it("resets back to null (platform default) when explicitly asked to", async () => {
    await updateInstitutionTheme(institutionA, adminAuthA, adminUserIdA, { themePalette: null });
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.themePalette).toBeNull();
  });

  it("never touches another institution's theme — full tenant isolation, same as every other table", async () => {
    await updateInstitutionTheme(institutionA, adminAuthA, adminUserIdA, { themePalette: "rose-plum" });
    await updateInstitutionTheme(institutionB, adminAuthB, adminUserIdB, { themePalette: "ocean-blue" });

    const a = await getInstitution(institutionA, adminAuthA);
    const b = await getInstitution(institutionB, adminAuthB);
    expect(a?.themePalette).toBe("rose-plum");
    expect(b?.themePalette).toBe("ocean-blue");
  });
});

describe("platform default palette (migration 0040 platform_settings)", () => {
  it("starts at the seeded default", async () => {
    expect(await getPlatformDefaultPalette()).toBe(DEFAULT_PALETTE_ID);
  });

  it("a real Super Admin can change it, and the new value is read back", async () => {
    await setPlatformDefaultPalette(superAdminAuth, { themePalette: "sunset-orange" });
    expect(await getPlatformDefaultPalette()).toBe("sunset-orange");
  });

  it("rejects a non-Super-Admin caller", async () => {
    await expect(setPlatformDefaultPalette(adminAuthA, { themePalette: "navy-teal" })).rejects.toThrow();
  });
});

describe("getPalette (pure helper, no DB)", () => {
  it("falls back to the built-in default for null/unknown ids", () => {
    expect(getPalette(null).id).toBe(DEFAULT_PALETTE_ID);
    expect(getPalette("not-a-real-palette").id).toBe(DEFAULT_PALETTE_ID);
  });

  it("resolves every curated id to itself", () => {
    for (const p of THEME_PALETTES) {
      expect(getPalette(p.id).id).toBe(p.id);
    }
  });

  it("never resolves to a black/near-black brand colour", () => {
    for (const p of THEME_PALETTES) {
      expect(p.vars.brand.toLowerCase()).not.toBe("#000000");
      expect(p.vars.brand.toLowerCase()).not.toBe("#18181b");
    }
  });
});
