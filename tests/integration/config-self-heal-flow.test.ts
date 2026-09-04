/**
 * PROMPT EDU ERP — Tasks #419/#420/#421: empty-config-dropdown fixes.
 *
 * Root cause (same across all three, matching the documented §211/§212/§404
 * pattern): createInstitution() — the real production institution-creation
 * path in services/super-admin/super-admin-service.ts — never seeds
 * character_rating_labels / achievement_categories / achievement_levels /
 * skill_types / skill_activities. Only a one-time migration backfill
 * (0037) or the DEMO-only database/scripts/seed.ts seeded them, so every
 * institution created through the real flow had permanently empty
 * dropdowns for these fields (§419 "rating is not functional", §420
 * "category and Level cant be added here", §421 "skill type and activity
 * can't be added").
 *
 * Fix: lazy self-heal-on-first-empty-read directly inside each listX()
 * service function, the same pattern already used by
 * modules/staff/service.ts's listObservationCriteria(). This test proves
 * that a freshly created (non-demo) institution — which seedDemoInstitution
 * deliberately does NOT pre-seed these tables for — gets non-empty,
 * usable config on first read, with no migration or manual seeding step.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { listCharacterRatingLabels } from "../../modules/discipline/service";
import { listAchievementCategories, listAchievementLevels } from "../../modules/achievements/service";
import { listSkillTypes, listSkillActivities, listSkillActivitiesForAdmin } from "../../modules/skills/service";

let institutionA: string;
let adminAuth: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  // seedDemoInstitution() only seeds academic/staff/student demo data, NOT
  // these config tables — it deliberately mirrors what createInstitution()
  // (the real production path) does, so this is the right fixture to prove
  // the self-heal fix rather than masking the bug with demo-only seeding.
  institutionA = await seedDemoInstitution(db, "self-heal-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@self-heal-a.example", "Self Heal Admin", "institution_admin");
  adminAuth = admin.authUserId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Character rating labels self-heal (§419)", () => {
  it("listCharacterRatingLabels() seeds defaults on first empty read instead of returning []", async () => {
    const labels = await listCharacterRatingLabels(institutionA, adminAuth);
    expect(labels).toHaveLength(5);
    expect(labels.map((l) => l.rating)).toEqual([1, 2, 3, 4, 5]);
    expect(labels.find((l) => l.rating === 5)?.label).toBe("Outstanding");
  });

  it("a second read is idempotent — no duplicate rows from re-seeding", async () => {
    const labels = await listCharacterRatingLabels(institutionA, adminAuth);
    expect(labels).toHaveLength(5);
  });
});

describe("Achievement categories/levels self-heal (§420)", () => {
  it("listAchievementCategories() seeds defaults on first empty read", async () => {
    const categories = await listAchievementCategories(institutionA, adminAuth);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.map((c) => c.name)).toContain("Sports Meet");
  });

  it("listAchievementLevels() seeds defaults on first empty read, sorted by sort_order", async () => {
    const levels = await listAchievementLevels(institutionA, adminAuth);
    expect(levels.length).toBeGreaterThan(0);
    expect(levels[0].name).toBe("School");
    expect(levels[levels.length - 1].name).toBe("International");
  });

  it("a second read is idempotent", async () => {
    const categories = await listAchievementCategories(institutionA, adminAuth);
    expect(categories).toHaveLength(4);
  });
});

describe("Skill types/activities self-heal (§421)", () => {
  it("listSkillTypes() seeds defaults on first empty read", async () => {
    const types = await listSkillTypes(institutionA, adminAuth);
    expect(types.length).toBeGreaterThan(0);
    expect(types.map((t) => t.code)).toEqual(expect.arrayContaining(["reading", "writing", "speaking", "language"]));
  });

  it("listSkillActivities() returns activities correctly linked to their seeded skill_type_id", async () => {
    const types = await listSkillTypes(institutionA, adminAuth);
    const activities = await listSkillActivities(institutionA, adminAuth);
    expect(activities.length).toBeGreaterThan(0);
    const typeIds = new Set(types.map((t) => t.id));
    for (const a of activities) expect(typeIds.has(a.skill_type_id)).toBe(true);
  });

  it("listSkillActivitiesForAdmin() also self-heals even if called before the other two", async () => {
    const db = await getDbClient();
    // Fresh institution to prove ordering doesn't matter — this one hits
    // listSkillActivitiesForAdmin() FIRST, unlike institutionA above.
    const institutionB = await seedDemoInstitution(db, "self-heal-school-b");
    const admin = await seedDemoUser(db, institutionB, "admin@self-heal-b.example", "Self Heal Admin B", "institution_admin");

    const adminActivities = await listSkillActivitiesForAdmin(institutionB, admin.authUserId);
    expect(adminActivities.length).toBeGreaterThan(0);

    const types = await listSkillTypes(institutionB, admin.authUserId);
    expect(types.length).toBeGreaterThan(0);
  });
});
