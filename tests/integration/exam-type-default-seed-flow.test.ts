/**
 * PROMPT EDU ERP -- Create Examination follow-up ("type of exam in create
 * exam is not working"). Root cause: a real institution with zero
 * exam_types rows gets a silently-empty required "Exam type" <select> on
 * Create Examination that can never be submitted -- confirmed live via a
 * direct production DB check that 7 of 9 real institutions had zero rows,
 * since neither createInstitution() nor provisionSksvbDefaults() ever
 * populate exam_types (only database/scripts/seed.ts's demo-data helper
 * did, which real institutions never go through).
 *
 * Exercises modules/examination/service.ts's listExamTypes() lazy-seed:
 * DEFAULT_EXAM_TYPES is provisioned the first time (and only the first
 * time) an institution's exam_types list comes back empty -- same
 * one-shot pattern as modules/staff/service.ts's
 * listObservationCriteria().
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { listExamTypes, createExamType } from "../../modules/examination/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "exam-type-seed-a");
  institutionB = await seedDemoInstitution(db, "exam-type-seed-b");

  const admin = await seedDemoUser(db, institutionA, "admin@exam-type-seed-a.example", "Exam Type Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  // seedDemoInstitution() itself inserts 4 demo exam types -- wipe them so
  // institutionA starts from the real, common production state (zero
  // rows) this bug was found in, rather than the seed script's own
  // best-case demo data masking it.
  await db.query("delete from exam_types where institution_id = $1", [institutionA]);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("listExamTypes() default lazy-seed", () => {
  it("provisions the 3 universal defaults the first time an institution has zero exam types", async () => {
    const types = await listExamTypes(institutionA, adminAuth);
    expect(types.map((t) => t.code).sort()).toEqual(["final", "term1", "term2"]);
    expect(types.map((t) => t.name).sort()).toEqual(["Final Exam", "Term 1 Exam", "Term 2 Exam"]);
  });

  it("does not duplicate on a second call", async () => {
    await listExamTypes(institutionA, adminAuth);
    const types = await listExamTypes(institutionA, adminAuth);
    expect(types).toHaveLength(3);
  });

  it("never re-seeds over an admin's own edits -- deleting down to zero again is left alone", async () => {
    const db = await getDbClient();
    await db.query("delete from exam_types where institution_id = $1", [institutionA]);
    // Add exactly one custom type -- a non-default code/name an admin
    // might realistically choose.
    await createExamType(institutionA, adminAuth, adminUserId, { code: "kithab_main", name: "Kithab Main Exam" });
    const types = await listExamTypes(institutionA, adminAuth);
    expect(types).toHaveLength(1);
    expect(types[0].code).toBe("kithab_main");
  });

  it("tenant isolation: seeding institution A's defaults does not touch institution B", async () => {
    const typesB = await listExamTypes(institutionB, adminAuth);
    // institutionB still has its own seedDemoInstitution() exam types
    // (never wiped in this test), not institutionA's defaults.
    expect(typesB.map((t) => t.code).sort()).toEqual(["academic_main", "academic_model", "kithab_main", "kithab_model"]);
  });
});
