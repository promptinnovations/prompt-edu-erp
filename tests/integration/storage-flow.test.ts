/**
 * PROMPT EDU ERP — Storage flow (ARCHITECTURE.md §D.13, §T.1, §U.2, Phase
 * 16): provider selection, FileService CRUD via LocalFileProvider,
 * moveFile()/migrateInstitutionFiles() idempotency, achievement
 * certificate upload end-to-end, schema fulfillment (evidence_file_id
 * column exists; reports.file_id FK rejects invalid refs), permission
 * boundaries, and tenant isolation.
 *
 * Deletes Supabase/Google env vars up front for determinism — this suite
 * only ever exercises LocalFileProvider (no external network calls), and
 * asserts the PROVIDER-SELECTION LOGIC separately without actually
 * constructing/using a live Supabase client (see "provider selection"
 * describe block below).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { getStorageProvider } from "../../services/storage/storage-provider";
import { uploadFile, getFile, listFiles, getDownloadUrl, deleteFile, moveFile } from "../../services/storage/file-service";
import { migrateInstitutionFiles } from "../../services/storage/migration-job";
import { submitAchievement, listAchievements } from "../../modules/achievements/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let managementAuth: string, managementUserId: string;
let teacherAuth: string, teacherUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "storage-school-a");
  institutionB = await seedDemoInstitution(db, "storage-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@storage-a.example", "Storage Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const management = await seedDemoUser(db, institutionA, "mgmt@storage-a.example", "Storage Management", "management");
  managementAuth = management.authUserId; managementUserId = management.userId;
  const teacher = await seedDemoUser(db, institutionA, "teacher@storage-a.example", "Storage Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("provider selection", () => {
  it("selects LocalFileProvider when no Supabase env vars are configured", () => {
    const provider = getStorageProvider();
    expect(provider.name).toBe("local");
  });

  it("selects SupabaseStorageProvider when Supabase env vars ARE configured (construction only — no network call)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
    try {
      const provider = getStorageProvider();
      expect(provider.name).toBe("supabase");
    } finally {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });
});

describe("FileService CRUD (LocalFileProvider)", () => {
  it("uploads, retrieves, lists, and deletes a file", async () => {
    const bytes = Buffer.from("hello prompt edu erp");
    const uploaded = await uploadFile(institutionA, adminAuth, adminUserId, {
      entityType: "test", entityId: null, fileName: "hello.txt", mimeType: "text/plain", bytes,
    });
    expect(uploaded.storage_provider).toBe("local");
    expect(Number(uploaded.size_bytes)).toBe(bytes.length);
    expect(uploaded.file_name).toBe("hello.txt");

    const fetched = await getFile(institutionA, adminAuth, uploaded.id);
    expect(fetched?.id).toBe(uploaded.id);

    const url = await getDownloadUrl(institutionA, adminAuth, uploaded.id);
    expect(url).toBe(`/api/files/${uploaded.id}`);

    const list = await listFiles(institutionA, adminAuth, { entityType: "test" });
    expect(list.some((f) => f.id === uploaded.id)).toBe(true);

    const deleted = await deleteFile(institutionA, adminAuth, adminUserId, uploaded.id);
    expect(deleted).toBe(true);
    const afterDelete = await getFile(institutionA, adminAuth, uploaded.id);
    expect(afterDelete).toBeNull();
  });

  it("rejects a path-traversal-shaped storage_file_id at the LocalFileProvider layer", async () => {
    const { createLocalFileProvider } = await import("../../services/storage/local-file-provider");
    const provider = createLocalFileProvider();
    await expect(provider.download("../../etc/passwd")).rejects.toThrow(/outside local storage root/);
  });
});

describe("upload validation (§X.2 rule 3 — server-side, regardless of client claims)", () => {
  it("rejects a file exceeding MAX_UPLOAD_BYTES", async () => {
    const previous = process.env.MAX_UPLOAD_BYTES;
    process.env.MAX_UPLOAD_BYTES = "10"; // 10 bytes, for a fast/deterministic test
    try {
      await expect(
        uploadFile(institutionA, adminAuth, adminUserId, {
          entityType: "test", entityId: null, fileName: "too-big.txt", mimeType: "text/plain", bytes: Buffer.from("this is definitely more than ten bytes"),
        })
      ).rejects.toThrow(/exceeds the maximum allowed size/);
    } finally {
      if (previous === undefined) delete process.env.MAX_UPLOAD_BYTES;
      else process.env.MAX_UPLOAD_BYTES = previous;
    }
  });

  it("rejects an empty file", async () => {
    await expect(
      uploadFile(institutionA, adminAuth, adminUserId, {
        entityType: "test", entityId: null, fileName: "empty.txt", mimeType: "text/plain", bytes: Buffer.from(""),
      })
    ).rejects.toThrow(/empty file/);
  });

  it("rejects a disallowed mime type even if the client claims it", async () => {
    await expect(
      uploadFile(institutionA, adminAuth, adminUserId, {
        entityType: "test", entityId: null, fileName: "script.sh", mimeType: "application/x-sh", bytes: Buffer.from("#!/bin/sh\necho hi"),
      })
    ).rejects.toThrow(/not allowed/);
  });

  it("rejects a missing/empty mime type rather than silently accepting it", async () => {
    await expect(
      uploadFile(institutionA, adminAuth, adminUserId, {
        entityType: "test", entityId: null, fileName: "no-type", mimeType: "", bytes: Buffer.from("data"),
      })
    ).rejects.toThrow(/file type is required/i);
  });
});

describe("moveFile / migrateInstitutionFiles idempotency", () => {
  it("moveFile is a no-op when the file is already on the target provider", async () => {
    const uploaded = await uploadFile(institutionA, adminAuth, adminUserId, {
      entityType: "test", entityId: null, fileName: "already-local.txt", mimeType: "text/plain", bytes: Buffer.from("x"),
    });
    const result = await moveFile(institutionA, adminAuth, adminUserId, uploaded.id, "local");
    expect(result?.storage_provider).toBe("local");
    expect(result?.storage_file_id).toBe(uploaded.storage_file_id); // untouched — genuinely a no-op, not a re-upload
  });

  it("migrateInstitutionFiles reports everything already-on-target when migrating to the only configured provider", async () => {
    const result = await migrateInstitutionFiles(institutionA, adminAuth, adminUserId, "local");
    expect(result.migrated).toBe(0);
    expect(result.failed).toHaveLength(0);
    expect(result.alreadyOnTarget).toBe(result.totalConsidered);
    expect(result.totalConsidered).toBeGreaterThan(0);
  });
});

describe("achievement certificate upload (end to end)", () => {
  it("attaches an uploaded file to a submitted achievement", async () => {
    const db = await getDbClient();
    const { rows: categoryRows } = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, (scoped) =>
      scoped.query<{ id: string }>("select id from achievement_categories limit 1")
    );
    const { rows: levelRows } = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, (scoped) =>
      scoped.query<{ id: string }>("select id from achievement_levels limit 1")
    );
    const { rows: studentRows } = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, (scoped) =>
      scoped.query<{ id: string }>(
        `insert into students (institution_id, full_name, admission_number, status) values ($1, 'Storage Test Student', 'STOR-001', 'active') returning id`,
        [institutionA]
      )
    );

    const certificate = await uploadFile(institutionA, adminAuth, adminUserId, {
      entityType: "achievements", entityId: null, fileName: "certificate.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-fake"),
    });

    const achievement = await submitAchievement(institutionA, adminAuth, adminUserId, {
      studentId: studentRows[0].id,
      categoryId: categoryRows[0].id,
      levelId: levelRows[0].id,
      title: "Storage Test Achievement",
      certificateFileId: certificate.id,
    });
    expect(achievement.certificate_file_id).toBe(certificate.id);

    const listed = await listAchievements(institutionA, adminAuth);
    const row = listed.find((a) => a.id === achievement.id);
    expect(row?.certificate_file_id).toBe(certificate.id);
  });
});

describe("schema fulfillment", () => {
  it("skill_submissions.evidence_file_id column exists and accepts a file reference", async () => {
    const db = await getDbClient();
    const uploaded = await uploadFile(institutionA, adminAuth, adminUserId, {
      entityType: "skill_submissions", entityId: null, fileName: "evidence.jpg", mimeType: "image/jpeg", bytes: Buffer.from("jpegbytes"),
    });
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const { rows: activityRows } = await scoped.query<{ id: string; student_id?: string }>("select id from skill_activities limit 1");
      const { rows: studentRows } = await scoped.query<{ id: string }>(
        `insert into students (institution_id, full_name, admission_number, status) values ($1, 'Evidence Test Student', 'STOR-002', 'active') returning id`,
        [institutionA]
      );
      const { rows } = await scoped.query<{ id: string; evidence_file_id: string | null }>(
        `insert into skill_submissions (institution_id, skill_activity_id, student_id, status, evidence_file_id)
         values ($1, $2, $3, 'submitted', $4) returning id, evidence_file_id`,
        [institutionA, activityRows[0].id, studentRows[0].id, uploaded.id]
      );
      expect(rows[0].evidence_file_id).toBe(uploaded.id);
    });
  });

  it("reports.file_id FK rejects a reference to a non-existent file", async () => {
    const db = await getDbClient();
    await expect(
      db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
        const { rows: defRows } = await scoped.query<{ code: string }>("select code from report_definitions limit 1");
        await scoped.query(
          `insert into reports (institution_id, report_type, format, file_id) values ($1, $2, 'pdf', $3)`,
          [institutionA, defRows[0].code, "00000000-0000-0000-0000-000000000000"]
        );
      })
    ).rejects.toThrow();
  });
});

describe("permission boundaries", () => {
  it("grants files.manage to management but not to a plain teacher", async () => {
    const mgmtPerms = await getPermissionsForUser(managementAuth, managementUserId, institutionA);
    expect(mgmtPerms.has("files.manage")).toBe(true);

    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(teacherPerms.has("files.manage")).toBe(false);
    expect(() => requirePermission(teacherPerms, "files.manage")).toThrow(/Forbidden/);
  });
});

describe("tenant isolation", () => {
  it("a file uploaded in institution A is invisible when listing from institution B", async () => {
    const uploaded = await uploadFile(institutionA, adminAuth, adminUserId, {
      entityType: "test", entityId: null, fileName: "isolation.txt", mimeType: "text/plain", bytes: Buffer.from("secret"),
    });

    const bAdmin = await seedDemoUser(await getDbClient(), institutionB, "admin@storage-b.example", "Storage B Admin", "institution_admin");
    const filesInB = await listFiles(institutionB, bAdmin.authUserId);
    expect(filesInB.some((f) => f.id === uploaded.id)).toBe(false);

    const fetchedFromB = await getFile(institutionB, bAdmin.authUserId, uploaded.id);
    expect(fetchedFromB).toBeNull();
  });
});
