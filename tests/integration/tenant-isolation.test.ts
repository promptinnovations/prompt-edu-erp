/**
 * PROMPT EDU ERP — Tenant isolation integration test (ARCHITECTURE.md §E.4).
 *
 * Proves the dual-gate isolation model works: creates two institutions with
 * DELIBERATELY OVERLAPPING data shapes (same class name, same admission
 * number) and asserts that a session scoped to Institution A can never read,
 * update, delete, or ID-enumerate Institution B's rows — even though both
 * exist in the same shared schema, same shared tables.
 *
 * Runs against an isolated, in-memory PGlite database (no external infra
 * needed) so this suite can run in CI on every PR (§AB "CI gates").
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createIsolatedTestClient, type DbClient } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution } from "../../database/scripts/seed";

let db: DbClient;
let institutionA: string;
let institutionB: string;
let studentA: string;
let studentB: string;
let classA: string;

beforeAll(async () => {
  db = await createIsolatedTestClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "inst-a");
  institutionB = await seedDemoInstitution(db, "inst-b");

  // Same class name "Grade 5" in both institutions — deliberately overlapping,
  // to prove isolation isn't accidentally relying on data being distinguishable.
  classA = await db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into classes (institution_id, name) values ($1, 'Grade 5') returning id`,
      [institutionA]
    );
    return rows[0].id;
  });

  await db.withInstitutionContext({ institutionId: institutionB, isSuperAdmin: false }, async (scoped) => {
    await scoped.query(`insert into classes (institution_id, name) values ($1, 'Grade 5')`, [institutionB]);
  });

  // Same admission number "1001" in both institutions.
  studentA = await db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into students (institution_id, admission_number, full_name) values ($1, '1001', 'Student A') returning id`,
      [institutionA]
    );
    return rows[0].id;
  });

  studentB = await db.withInstitutionContext({ institutionId: institutionB, isSuperAdmin: false }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into students (institution_id, admission_number, full_name) values ($1, '1001', 'Student B') returning id`,
      [institutionB]
    );
    return rows[0].id;
  });
});

afterAll(async () => {
  await db.close();
});

describe("tenant isolation — RLS (§E)", () => {
  it("Institution A cannot SELECT Institution B's students, even overlapping admission numbers", async () => {
    await db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
      const { rows } = await scoped.query("select * from students");
      expect(rows).toHaveLength(1);
      expect((rows[0] as { id: string }).id).toBe(studentA);
    });
  });

  it("Institution A cannot fetch Institution B's student by direct ID (URL/API/ID manipulation, §E.3)", async () => {
    await db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
      const { rows } = await scoped.query("select * from students where id = $1", [studentB]);
      expect(rows).toHaveLength(0); // not 403 with data — genuinely zero rows
    });
  });

  it("Institution A cannot UPDATE Institution B's student by ID", async () => {
    await db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
      const { rows } = await scoped.query(
        "update students set full_name = 'HACKED' where id = $1 returning id",
        [studentB]
      );
      expect(rows).toHaveLength(0);
    });
    // Verify Institution B's data is untouched
    await db.withInstitutionContext({ institutionId: institutionB, isSuperAdmin: false }, async (scoped) => {
      const { rows } = await scoped.query<{ full_name: string }>("select full_name from students where id = $1", [studentB]);
      expect(rows[0].full_name).toBe("Student B");
    });
  });

  it("Institution A cannot DELETE Institution B's student by ID", async () => {
    await db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
      await scoped.query("delete from students where id = $1", [studentB]);
    });
    await db.withInstitutionContext({ institutionId: institutionB, isSuperAdmin: false }, async (scoped) => {
      const { rows } = await scoped.query("select id from students where id = $1", [studentB]);
      expect(rows).toHaveLength(1); // still exists
    });
  });

  it("Institution A cannot INSERT a row claiming institution_id = Institution B (payload manipulation, §E.3)", async () => {
    await expect(
      db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
        await scoped.query(
          "insert into students (institution_id, admission_number, full_name) values ($1, '9999', 'Spoofed') ",
          [institutionB]
        );
      })
    ).rejects.toThrow();
  });

  it("Institution A's class list does not include Institution B's overlapping-named class", async () => {
    await db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
      const { rows } = await scoped.query("select id from classes where name = 'Grade 5'");
      expect(rows).toHaveLength(1);
      expect((rows[0] as { id: string }).id).toBe(classA);
    });
  });

  it("ID-enumeration fuzz: every Institution B entity id returns zero rows under Institution A's context", async () => {
    const bIds = await db.withInstitutionContext({ institutionId: institutionB, isSuperAdmin: false }, async (scoped) => {
      const { rows } = await scoped.query<{ id: string }>("select id from students union select id from classes");
      return rows.map((r) => r.id);
    });
    expect(bIds.length).toBeGreaterThan(0);

    await db.withInstitutionContext({ institutionId: institutionA, isSuperAdmin: false }, async (scoped) => {
      for (const id of bIds) {
        const students = await scoped.query("select id from students where id = $1", [id]);
        const classes = await scoped.query("select id from classes where id = $1", [id]);
        expect(students.rows.length + classes.rows.length).toBe(0);
      }
    });
  });

  it("Super Admin context CAN see rows across both institutions (explicit, audited exception, §B.4)", async () => {
    const { rows } = await db.withInstitutionContext({ institutionId: null, isSuperAdmin: true }, async (scoped) => {
      return scoped.query("select institution_id from students order by institution_id");
    });
    const distinctInstitutions = new Set(rows.map((r) => (r as { institution_id: string }).institution_id));
    expect(distinctInstitutions.has(institutionA)).toBe(true);
    expect(distinctInstitutions.has(institutionB)).toBe(true);
  });

  it("a session with no institution context set (institutionId: null, not super admin) sees nothing", async () => {
    await db.withInstitutionContext({ institutionId: null, isSuperAdmin: false }, async (scoped) => {
      const { rows } = await scoped.query("select id from students");
      expect(rows).toHaveLength(0);
    });
  });
});
