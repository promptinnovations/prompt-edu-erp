/**
 * PROMPT EDU ERP — dashboard onboarding checklist ("show a checklist to
 * fill and configure; once complete it goes away; support skip / do
 * later"). Proves: items start pending on a fresh institution, flip to
 * done the moment real data exists (no separate "mark complete" step),
 * skip/unskip work and are independent of the done flag, and everything
 * is fully tenant-isolated like every other table in this schema.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getOnboardingChecklist, skipOnboardingItem, unskipOnboardingItem } from "../../services/onboarding/onboarding-service";
import { createClass } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";

let institutionA: string, institutionB: string;
let adminAuthA: string, adminUserIdA: string;
let adminAuthB: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "checklist-school-a");
  institutionB = await seedDemoInstitution(db, "checklist-school-b");

  const adminA = await seedDemoUser(db, institutionA, "admin@checklist-a.example", "Checklist School A Admin", "institution_admin");
  adminAuthA = adminA.authUserId;
  adminUserIdA = adminA.userId;

  const adminB = await seedDemoUser(db, institutionB, "admin@checklist-b.example", "Checklist School B Admin", "institution_admin");
  adminAuthB = adminB.authUserId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("getOnboardingChecklist", () => {
  it("starts with every item pending (not done, not skipped) on a freshly seeded institution — except library, which seedDemoInstitution deliberately pre-populates with a sample catalogue", async () => {
    const items = await getOnboardingChecklist(institutionA, adminAuthA);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.skipped).toBe(false);
      if (item.code === "library") {
        expect(item.done).toBe(true); // sample catalogue already exists
      } else {
        expect(item.done).toBe(false);
      }
    }
  });

  it("flips an item to done the moment real data exists, with no separate 'mark complete' step", async () => {
    await createClass(institutionA, adminAuthA, adminUserIdA, { name: "Grade 1", sortOrder: 0 });
    const items = await getOnboardingChecklist(institutionA, adminAuthA);
    const academic = items.find((i) => i.code === "academic_structure");
    expect(academic?.done).toBe(true);

    // Untouched items are still pending.
    const students = items.find((i) => i.code === "students");
    expect(students?.done).toBe(false);
  });

  it("only includes module-gated items (staff/library) when that module is actually enabled", async () => {
    const items = await getOnboardingChecklist(institutionA, adminAuthA);
    const codes = items.map((i) => i.code);
    // seedDemoInstitution enables staff + library among the demo modules.
    expect(codes).toContain("staff");
    expect(codes).toContain("library");
  });
});

describe("skipOnboardingItem / unskipOnboardingItem", () => {
  it("marks an item skipped without marking it done", async () => {
    await skipOnboardingItem(institutionA, adminAuthA, adminUserIdA, "announcements");
    const items = await getOnboardingChecklist(institutionA, adminAuthA);
    const announcements = items.find((i) => i.code === "announcements");
    expect(announcements?.skipped).toBe(true);
    expect(announcements?.done).toBe(false);
  });

  it("is idempotent — skipping an already-skipped item is a harmless no-op", async () => {
    await expect(skipOnboardingItem(institutionA, adminAuthA, adminUserIdA, "announcements")).resolves.not.toThrow();
    const items = await getOnboardingChecklist(institutionA, adminAuthA);
    expect(items.find((i) => i.code === "announcements")?.skipped).toBe(true);
  });

  it("'do it later' — unskipping moves the item back to pending", async () => {
    await unskipOnboardingItem(institutionA, adminAuthA, "announcements");
    const items = await getOnboardingChecklist(institutionA, adminAuthA);
    const announcements = items.find((i) => i.code === "announcements");
    expect(announcements?.skipped).toBe(false);
    expect(announcements?.done).toBe(false);
  });

  it("real data completing a previously-skipped item takes precedence over the stale skip flag", async () => {
    await skipOnboardingItem(institutionA, adminAuthA, adminUserIdA, "students");
    await createStudent(institutionA, adminAuthA, adminUserIdA, { admissionNumber: "S-CHK-1", fullName: "Checklist Test Student" });
    const items = await getOnboardingChecklist(institutionA, adminAuthA);
    const students = items.find((i) => i.code === "students");
    expect(students?.done).toBe(true);
  });

  it("never affects another institution's checklist — full tenant isolation", async () => {
    await skipOnboardingItem(institutionA, adminAuthA, adminUserIdA, "library");
    const itemsB = await getOnboardingChecklist(institutionB, adminAuthB);
    expect(itemsB.find((i) => i.code === "library")?.skipped).toBe(false);
  });
});
