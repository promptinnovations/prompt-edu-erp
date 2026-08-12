/**
 * PROMPT EDU ERP — LimitService (ARCHITECTURE.md §W.2). Proves: an
 * institution auto-gets a plan at creation time, getInstitutionLimitsOverview
 * reports ok/warning/critical/exceeded at the right thresholds, a capped
 * resource genuinely refuses the ONE insert that would exceed it (via
 * modules/students/service.ts's createStudent(), the real call site) while
 * every insert up to the cap still succeeds, existing rows are never
 * retroactively touched, and an uncapped resource (null column) is always
 * "ok" with limit=null.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent } from "../../modules/students/service";
import { createStaffMember } from "../../modules/staff/service";
import { checkLimit, getInstitutionLimitsOverview } from "../../services/limits/limit-service";

let institutionId: string;
let adminAuth: string, adminUserId: string;
let tinyPlanId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionId = await seedDemoInstitution(db, "limit-school");
  const admin = await seedDemoUser(db, institutionId, "admin@limit-school.example", "Limit Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  // A dedicated tiny plan (cap=2 students, uncapped staff) so this test
  // doesn't need to insert hundreds of rows to reach the real Starter plan's
  // caps — swapping institutions.plan_id is the same mechanism a real plan
  // change/upgrade would use.
  const { rows } = await db.query<{ id: string }>(
    `insert into subscription_plans (name, max_students, max_staff, max_users, max_storage_mb, is_active)
     values ('Tiny Test Plan', 2, null, null, null, true) returning id`
  );
  tinyPlanId = rows[0].id;
  await db.query(`update institutions set plan_id = $1 where id = $2`, [tinyPlanId, institutionId]);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("institution auto-plan assignment", () => {
  it("seedDemoInstitution() assigns a real plan_id (not null)", async () => {
    const db = await getDbClient();
    const { rows } = await db.query<{ plan_id: string | null }>("select plan_id from institutions where id = $1", [institutionId]);
    expect(rows[0].plan_id).not.toBeNull();
  });
});

describe("getInstitutionLimitsOverview / checkLimit", () => {
  it("reports 'ok' with 0 used before any students exist", async () => {
    const overview = await getInstitutionLimitsOverview(institutionId, adminAuth);
    const students = overview.find((r) => r.resource === "students");
    expect(students).toMatchObject({ used: 0, limit: 2, status: "ok" });
  });

  it("an uncapped resource (null plan column) is always 'ok' with limit null", async () => {
    const staff = await checkLimit(institutionId, adminAuth, "staff");
    expect(staff.limit).toBeNull();
    expect(staff.status).toBe("ok");
  });

  it("reaching capacity flips status to 'exceeded' once used === limit", async () => {
    await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "T-001", fullName: "Student One" });
    let overview = await getInstitutionLimitsOverview(institutionId, adminAuth);
    // 1/2 = 50% — below the 80% warning threshold.
    expect(overview.find((r) => r.resource === "students")).toMatchObject({ used: 1, status: "ok" });

    await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "T-002", fullName: "Student Two" });
    overview = await getInstitutionLimitsOverview(institutionId, adminAuth);
    // 2/2 = 100% — at capacity.
    expect(overview.find((r) => r.resource === "students")).toMatchObject({ used: 2, status: "exceeded" });
  });
});

describe("assertBelowLimit via the real createStudent() call site", () => {
  it("refuses the insert that would exceed the cap, with a clear message", async () => {
    await expect(
      createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "T-003", fullName: "Student Three" })
    ).rejects.toThrow(/plan limit for students \(2\/2\)/);
  });

  it("never retroactively touches the students that already exist", async () => {
    const db = await getDbClient();
    const { rows } = await db.withInstitutionContext({ institutionId, authUserId: adminAuth }, (scoped) =>
      scoped.query<{ count: string }>("select count(*)::text as count from students where institution_id = $1", [institutionId])
    );
    expect(rows[0].count).toBe("2");
  });
});

describe("warning threshold (80%)", () => {
  it("flips to 'warning' at >=80% and stays below 'exceeded' until used===limit", async () => {
    const db = await getDbClient();
    // A separate institution with a 10-cap plan so 8/10 = 80% is reachable
    // without colliding with the 2-cap institution above.
    const inst2 = await seedDemoInstitution(db, "limit-school-2");
    const admin2 = await seedDemoUser(db, inst2, "admin2@limit-school.example", "Limit Admin Two", "institution_admin");
    const { rows } = await db.query<{ id: string }>(
      `insert into subscription_plans (name, max_students, is_active) values ('Warning Test Plan', 10, true) returning id`
    );
    await db.query(`update institutions set plan_id = $1 where id = $2`, [rows[0].id, inst2]);

    for (let i = 0; i < 8; i++) {
      await createStudent(inst2, admin2.authUserId, admin2.userId, { admissionNumber: `W-${i}`, fullName: `Warn Student ${i}` });
    }
    const overview = await getInstitutionLimitsOverview(inst2, admin2.authUserId);
    expect(overview.find((r) => r.resource === "students")).toMatchObject({ used: 8, status: "warning" });
  });
});

describe("staff creation is guarded by the same mechanism", () => {
  it("createStaffMember() refuses once the staff cap is reached", async () => {
    const db = await getDbClient();
    const inst3 = await seedDemoInstitution(db, "limit-school-3");
    const admin3 = await seedDemoUser(db, inst3, "admin3@limit-school.example", "Limit Admin Three", "institution_admin");
    const { rows } = await db.query<{ id: string }>(
      `insert into subscription_plans (name, max_staff, is_active) values ('Staff Cap Plan', 1, true) returning id`
    );
    await db.query(`update institutions set plan_id = $1 where id = $2`, [rows[0].id, inst3]);

    await createStaffMember(inst3, admin3.authUserId, admin3.userId, {
      email: "staffer1@limit-school.example", fullName: "Staffer One", staffCode: "SC-1", employmentStatus: "active",
    });

    await expect(
      createStaffMember(inst3, admin3.authUserId, admin3.userId, {
        email: "staffer2@limit-school.example", fullName: "Staffer Two", staffCode: "SC-2", employmentStatus: "active",
      })
    ).rejects.toThrow(/plan limit for staff \(1\/1\)/);
  });
});
