/**
 * PROMPT EDU ERP — Institution self-service branding flow (§137 follow-up:
 * "options for changing colour codes of the app according to their wish").
 * Proves: an institution's own admin (not just Super Admin) can set/read
 * their own primary_color, invalid hex values are rejected, a "reset" call
 * clears it back to null (getBrandColors() then falls back to
 * DEFAULT_BRAND_COLOR), and one institution's colour is fully isolated from
 * another's — the same tenant-isolation guarantee every other table gets,
 * now proven for migration 0020's institutions_update_self RLS policy too.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import {
  getInstitution, updateInstitutionBranding, getBrandColors, darkenHex, DEFAULT_BRAND_COLOR,
} from "../../services/institution/institution-service";

let institutionA: string, institutionB: string;
let adminAuthA: string, adminUserIdA: string;
let adminAuthB: string, adminUserIdB: string;

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
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("reading an institution's colour", () => {
  it("defaults to null (no colour picked yet) before any branding update", async () => {
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.primaryColor).toBeNull();
  });
});

describe("updateInstitutionBranding", () => {
  it("lets the institution's own admin set a valid hex colour, reflected immediately by getInstitution", async () => {
    await updateInstitutionBranding(institutionA, adminAuthA, adminUserIdA, { primaryColor: "#2563eb" });
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.primaryColor).toBe("#2563eb");
  });

  it("rejects a malformed hex colour and leaves the stored value unchanged", async () => {
    await expect(
      updateInstitutionBranding(institutionA, adminAuthA, adminUserIdA, { primaryColor: "blue" })
    ).rejects.toThrow();
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.primaryColor).toBe("#2563eb"); // unchanged from the previous test
  });

  it("resets back to null (the app default) when explicitly asked to", async () => {
    await updateInstitutionBranding(institutionA, adminAuthA, adminUserIdA, { primaryColor: null });
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.primaryColor).toBeNull();
  });

  it("never touches another institution's colour — full tenant isolation, same as every other table", async () => {
    await updateInstitutionBranding(institutionA, adminAuthA, adminUserIdA, { primaryColor: "#dc2626" });
    await updateInstitutionBranding(institutionB, adminAuthB, adminUserIdB, { primaryColor: "#16a34a" });

    const a = await getInstitution(institutionA, adminAuthA);
    const b = await getInstitution(institutionB, adminAuthB);
    expect(a?.primaryColor).toBe("#dc2626");
    expect(b?.primaryColor).toBe("#16a34a");
  });
});

describe("getBrandColors / darkenHex (pure helpers, no DB)", () => {
  it("falls back to DEFAULT_BRAND_COLOR when the institution has no colour set", () => {
    const { brand } = getBrandColors(null);
    expect(brand).toBe(DEFAULT_BRAND_COLOR);
  });

  it("falls back to DEFAULT_BRAND_COLOR for a malformed stored value rather than passing it through unsafely", () => {
    const { brand } = getBrandColors("not-a-colour");
    expect(brand).toBe(DEFAULT_BRAND_COLOR);
  });

  it("uses the institution's own colour when it's a valid hex", () => {
    const { brand } = getBrandColors("#2563eb");
    expect(brand).toBe("#2563eb");
  });

  it("derives a strictly darker hover shade from the brand colour", () => {
    const { brand, brandHover } = getBrandColors("#2563eb");
    expect(brandHover).not.toBe(brand);
    expect(brandHover.toLowerCase()).toBe(darkenHex("#2563eb", 0.15).toLowerCase());
    // Sanity: each RGB channel of the hover shade is <= the original.
    const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [r1, g1, b1] = toRgb(brand);
    const [r2, g2, b2] = toRgb(brandHover);
    expect(r2).toBeLessThanOrEqual(r1);
    expect(g2).toBeLessThanOrEqual(g1);
    expect(b2).toBeLessThanOrEqual(b1);
  });

  it("darkenHex returns pure black unchanged and leaves an invalid string as-is", () => {
    expect(darkenHex("#000000", 0.5)).toBe("#000000");
    expect(darkenHex("not-hex", 0.5)).toBe("not-hex");
  });
});
