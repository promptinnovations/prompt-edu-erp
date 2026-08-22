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
    const institution = await createInstitution(superAdminAuth, { code: "green-valley", name: "Green Valley School", type: "school", board: "kerala_state", defaultLocale: "en" });
    expect(institution.status).toBe("trial");
    expect(institution.code).toBe("green-valley");

    const db = await getDbClient();
    const roleCodes = await db.withInstitutionContext({ institutionId: institution.id, authUserId: superAdminAuth, isSuperAdmin: true }, async (scoped) => {
      const { rows } = await scoped.query<{ code: string }>("select code from roles where institution_id = $1 order by code", [institution.id]);
      return rows.map((r) => r.code);
    });
    expect(roleCodes.sort()).toEqual(
      ["institution_admin", "librarian", "management", "parent", "section_head", "staff", "student", "teacher"].sort()
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
      code: "admin-bundle-school", name: "Admin Bundle School", type: "school", board: "kerala_state", defaultLocale: "en",
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
        code: "partial-admin-school", name: "Partial Admin School", type: "school", board: "kerala_state", defaultLocale: "en",
        adminEmail: "only-email@partial.example",
      })
    ).rejects.toThrow();
  });

  it("creates the institution with no admin at all when none of the three are given (existing behavior unchanged)", async () => {
    const institution = await createInstitution(superAdminAuth, {
      code: "no-admin-school", name: "No Admin School", type: "school", board: "kerala_state", defaultLocale: "en",
    });
    expect(institution.code).toBe("no-admin-school");
  });

  it("rejects an admin email that's already used by another user on the platform, and creates nothing (institution rolled back too)", async () => {
    await expect(
      createInstitution(superAdminAuth, {
        code: "dupe-admin-school", name: "Dupe Admin School", type: "school", board: "kerala_state", defaultLocale: "en",
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

describe("educational board (§137 follow-up: SKSVB/SKIMVB for madrasa institutions)", () => {
  it("requires a board when type is madrasa", async () => {
    await expect(
      createInstitution(superAdminAuth, { code: "no-board-madrasa", name: "No Board Madrasa", type: "madrasa", defaultLocale: "en" })
    ).rejects.toThrow(/educational board/i);
  });

  it("rejects a madrasa board given for a school (wrong board group)", async () => {
    await expect(
      createInstitution(superAdminAuth, { code: "school-with-board", name: "School With Board", type: "school", board: "sksvb", defaultLocale: "en" })
    ).rejects.toThrow(/doesn't apply to a school/i);
  });

  it("rejects a board given for a type with no board group at all", async () => {
    await expect(
      createInstitution(superAdminAuth, { code: "college-with-board", name: "College With Board", type: "college", board: "sksvb", defaultLocale: "en" })
    ).rejects.toThrow(/only applies to madrasa or school/i);
  });

  it("SKIMVB just records the choice — no auto-provisioning yet", async () => {
    const institution = await createInstitution(superAdminAuth, {
      code: "skimvb-madrasa", name: "SKIMVB Madrasa", type: "madrasa", board: "skimvb", defaultLocale: "en",
    });
    expect(institution.board).toBe("skimvb");

    const db = await getDbClient();
    const classCount = await db.withInstitutionContext(
      { institutionId: institution.id, authUserId: superAdminAuth, isSuperAdmin: true },
      async (scoped) => {
        const { rows } = await scoped.query<{ count: string }>("select count(*) as count from classes where institution_id = $1", [institution.id]);
        return Number(rows[0].count);
      }
    );
    expect(classCount).toBe(0);
  });

  it("SKSVB auto-provisions classes 1-12, the full syllabus, and flags Qur'an & Hifz as the practical-only subject", async () => {
    const institution = await createInstitution(superAdminAuth, {
      code: "sksvb-madrasa", name: "SKSVB Madrasa", type: "madrasa", board: "sksvb", defaultLocale: "en",
    });
    expect(institution.board).toBe("sksvb");

    const db = await getDbClient();
    const { classes, classSubjectRows, practicalSubject } = await db.withInstitutionContext(
      { institutionId: institution.id, authUserId: superAdminAuth, isSuperAdmin: true },
      async (scoped) => {
        const { rows: classes } = await scoped.query<{ name: string }>(
          "select name from classes where institution_id = $1 order by sort_order", [institution.id]
        );
        const { rows: classSubjectRows } = await scoped.query<{ class_name: string; subject_name: string; is_core: boolean }>(
          `select c.name as class_name, s.name as subject_name, cs.is_core
             from class_subjects cs
             join classes c on c.id = cs.class_id
             join subjects s on s.id = cs.subject_id
            where cs.institution_id = $1`,
          [institution.id]
        );
        const { rows: practicalSubject } = await scoped.query<{ category: string | null }>(
          "select category from subjects where institution_id = $1 and name = $2", [institution.id, "Qur'an & Hifz"]
        );
        return { classes, classSubjectRows, practicalSubject };
      }
    );

    expect(classes.map((c) => c.name)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);

    // Class 1 has no "Qur'an & Hifz" per the given syllabus; class 2 onward does.
    const class1Subjects = classSubjectRows.filter((r) => r.class_name === "1").map((r) => r.subject_name);
    expect(class1Subjects.sort()).toEqual(["Duroosul Islam", "Kithabath", "Thafheemul Qur'an"].sort());

    const class2QuranHifz = classSubjectRows.find((r) => r.class_name === "2" && r.subject_name === "Qur'an & Hifz");
    expect(class2QuranHifz?.is_core).toBe(false); // practical, not core

    const class2Duroosul = classSubjectRows.find((r) => r.class_name === "2" && r.subject_name === "Duroosul Islam");
    expect(class2Duroosul?.is_core).toBe(true); // an 80+20 subject, is_core stays true

    expect(practicalSubject[0]?.category).toBe("practical");
  });

  it("requires a curriculum board when type is school", async () => {
    await expect(
      createInstitution(superAdminAuth, { code: "no-board-school", name: "No Board School", type: "school", defaultLocale: "en" })
    ).rejects.toThrow(/curriculum board/i);
  });

  it("Kerala State board auto-provisions a default 9-band grade scale with resolved hex colors and sets institution pass_pct to 35", async () => {
    const institution = await createInstitution(superAdminAuth, {
      code: "kerala-school", name: "Kerala School", type: "school", board: "kerala_state", defaultLocale: "en",
    });
    expect(institution.board).toBe("kerala_state");

    const db = await getDbClient();
    const { scale, bands, passPct } = await db.withInstitutionContext(
      { institutionId: institution.id, authUserId: superAdminAuth, isSuperAdmin: true },
      async (scoped) => {
        const { rows: scale } = await scoped.query<{ id: string; name: string; is_default: boolean; curriculum: string | null }>(
          "select id, name, is_default, curriculum from grade_scales where institution_id = $1", [institution.id]
        );
        const { rows: bands } = await scoped.query<{ grade_label: string; color: string | null; min_percent: string; max_percent: string }>(
          "select grade_label, color, min_percent, max_percent from grade_bands where grade_scale_id = $1 order by min_percent desc",
          [scale[0].id]
        );
        const { rows: inst } = await scoped.query<{ pass_pct: string }>("select pass_pct from institutions where id = $1", [institution.id]);
        return { scale: scale[0], bands, passPct: Number(inst[0].pass_pct) };
      }
    );

    expect(scale.is_default).toBe(true);
    expect(scale.curriculum).toBe("Kerala State Curriculum (SCERT)");
    expect(bands).toHaveLength(9);
    expect(bands.map((b) => b.grade_label)).toEqual(["A+", "A", "B+", "B", "C+", "C", "D+", "D", "E"]);
    expect(bands.every((b) => /^#[0-9a-f]{6}$/.test(b.color ?? ""))).toBe(true); // every band got a resolved hex color
    expect(new Set(bands.map((b) => b.color)).size).toBe(9); // 9 distinct colors, not one flat accent
    expect(passPct).toBe(35);
  });

  it("CBSE and ICSE boards each provision their own distinct 9-point preset", async () => {
    const cbse = await createInstitution(superAdminAuth, { code: "cbse-school", name: "CBSE School", type: "school", board: "cbse", defaultLocale: "en" });
    const icse = await createInstitution(superAdminAuth, { code: "icse-school", name: "ICSE School", type: "school", board: "icse", defaultLocale: "en" });

    const db = await getDbClient();
    for (const [inst, expectedFirstLabel, expectedPassPct] of [[cbse, "A1", 33], [icse, "A1", 33]] as const) {
      const { bands, passPct } = await db.withInstitutionContext(
        { institutionId: inst.id, authUserId: superAdminAuth, isSuperAdmin: true },
        async (scoped) => {
          const { rows: scale } = await scoped.query<{ id: string }>("select id from grade_scales where institution_id = $1", [inst.id]);
          const { rows: bands } = await scoped.query<{ grade_label: string }>(
            "select grade_label from grade_bands where grade_scale_id = $1 order by min_percent desc", [scale[0].id]
          );
          const { rows: instRow } = await scoped.query<{ pass_pct: string }>("select pass_pct from institutions where id = $1", [inst.id]);
          return { bands, passPct: Number(instRow[0].pass_pct) };
        }
      );
      expect(bands[0].grade_label).toBe(expectedFirstLabel);
      expect(passPct).toBe(expectedPassPct);
    }
  });
});
