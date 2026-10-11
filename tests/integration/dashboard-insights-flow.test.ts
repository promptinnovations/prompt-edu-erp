/**
 * §Staff-dashboard-visual-redesign — services/home/dashboard-insights.ts:
 * role names, library and fee snapshots run cleanly and count correctly.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getMyRoleNames, getLibrarySnapshot, getFeeSnapshot } from "../../services/home/dashboard-insights";

let inst: string;
let adminAuth: string, adminUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "dash-a");
  const admin = await seedDemoUser(db, inst, "admin@dash-a.example", "Dash Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("dashboard insights", () => {
  it("returns the user's role names", async () => {
    const names = await getMyRoleNames(inst, adminAuth, adminUserId);
    expect(names.length).toBeGreaterThan(0);
  });

  it("library snapshot: zero counts and six months of history", async () => {
    const s = await getLibrarySnapshot(inst, adminAuth);
    expect(s.issuedNow).toBe(0);
    expect(s.overdue).toBe(0);
    expect(s.issuesByMonth).toHaveLength(6);
  });

  it("fee snapshot: zero totals and six months of collections", async () => {
    const s = await getFeeSnapshot(inst, adminAuth);
    expect(s.due).toBe(0);
    expect(s.collected).toBe(0);
    expect(s.collectedByMonth).toHaveLength(6);
  });
});
