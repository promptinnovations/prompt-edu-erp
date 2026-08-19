/**
 * PROMPT EDU ERP — institution logo flow ("Can I add institution logo?"
 * follow-up). Proves: an institution admin can upload a file via the
 * existing FileService and point institutions.logo_file_id at it,
 * getInstitution()/getInstitutionPublicSummaryByCode() surface it correctly,
 * getPublicLogoFile() (the pre-auth /api/institution-logo/[code] lookup)
 * only ever serves a file that is genuinely this institution's own,
 * entity_type = 'institution_logo', AND is_public = true — and that
 * updateInstitutionLogo() refuses to attach a file belonging to a
 * different institution even though the FK constraint alone wouldn't stop
 * it (see that function's own doc comment for why).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { uploadFile } from "../../services/storage/file-service";
import {
  getInstitution, getInstitutionPublicSummaryByCode, updateInstitutionLogo, getPublicLogoFile,
} from "../../services/institution/institution-service";

let institutionA: string, institutionB: string;
let codeA: string, codeB: string;
let adminAuthA: string, adminUserIdA: string;
let adminAuthB: string, adminUserIdB: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  codeA = "logo-school-a";
  codeB = "logo-school-b";
  institutionA = await seedDemoInstitution(db, codeA);
  institutionB = await seedDemoInstitution(db, codeB);

  const adminA = await seedDemoUser(db, institutionA, "admin@logo-a.example", "Logo School A Admin", "institution_admin");
  adminAuthA = adminA.authUserId; adminUserIdA = adminA.userId;

  const adminB = await seedDemoUser(db, institutionB, "admin@logo-b.example", "Logo School B Admin", "institution_admin");
  adminAuthB = adminB.authUserId; adminUserIdB = adminB.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("before any logo is uploaded", () => {
  it("getInstitution() and getInstitutionPublicSummaryByCode() both report no logo", async () => {
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.logoFileId).toBeNull();

    const publicSummary = await getInstitutionPublicSummaryByCode(codeA);
    expect(publicSummary?.hasLogo).toBe(false);
  });

  it("getPublicLogoFile() returns null for an institution with no logo set", async () => {
    expect(await getPublicLogoFile(codeA)).toBeNull();
  });

  it("getPublicLogoFile() returns null for a code that doesn't exist at all", async () => {
    expect(await getPublicLogoFile("no-such-institution")).toBeNull();
  });
});

describe("uploading and attaching a logo (Settings page flow)", () => {
  it("uploadFile() + updateInstitutionLogo() together make the logo visible everywhere it's read from", async () => {
    const uploaded = await uploadFile(institutionA, adminAuthA, adminUserIdA, {
      entityType: "institution_logo", entityId: institutionA,
      fileName: "logo.png", mimeType: "image/png", isPublic: true,
      bytes: Buffer.from("fake-png-bytes"),
    });

    await updateInstitutionLogo(institutionA, adminAuthA, adminUserIdA, uploaded.id);

    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.logoFileId).toBe(uploaded.id);

    const publicSummary = await getInstitutionPublicSummaryByCode(codeA);
    expect(publicSummary?.hasLogo).toBe(true);

    const file = await getPublicLogoFile(codeA);
    expect(file).toMatchObject({ storageProvider: "local", mimeType: "image/png", fileName: "logo.png" });
  });

  it("a different institution's code (with no logo of its own) still reports none, even after A's upload", async () => {
    const publicSummary = await getInstitutionPublicSummaryByCode(codeB);
    expect(publicSummary?.hasLogo).toBe(false);
    expect(await getPublicLogoFile(codeB)).toBeNull();
  });
});

describe("getPublicLogoFile()'s defense-in-depth conditions", () => {
  it("refuses to serve a file that isn't marked is_public, even if logo_file_id somehow pointed at it", async () => {
    // Uploaded with isPublic left at its default (false) — simulates a
    // hypothetical future bug/misuse where logo_file_id ends up pointing at
    // a non-public file; the lookup must still refuse to serve it.
    const notPublic = await uploadFile(institutionA, adminAuthA, adminUserIdA, {
      entityType: "institution_logo", entityId: institutionA,
      fileName: "not-public.png", mimeType: "image/png",
      bytes: Buffer.from("bytes"),
    });
    await updateInstitutionLogo(institutionA, adminAuthA, adminUserIdA, notPublic.id);
    expect(await getPublicLogoFile(codeA)).toBeNull();
  });

  it("refuses to serve a file tagged with the wrong entity_type", async () => {
    const wrongEntityType = await uploadFile(institutionA, adminAuthA, adminUserIdA, {
      entityType: "achievements", entityId: null,
      fileName: "not-a-logo.png", mimeType: "image/png", isPublic: true,
      bytes: Buffer.from("bytes"),
    });
    await updateInstitutionLogo(institutionA, adminAuthA, adminUserIdA, wrongEntityType.id);
    expect(await getPublicLogoFile(codeA)).toBeNull();
  });

  it("updateInstitutionLogo() itself refuses to attach a file belonging to a DIFFERENT institution", async () => {
    const fileOwnedByB = await uploadFile(institutionB, adminAuthB, adminUserIdB, {
      entityType: "institution_logo", entityId: institutionB,
      fileName: "b-logo.png", mimeType: "image/png", isPublic: true,
      bytes: Buffer.from("bytes"),
    });
    await expect(
      updateInstitutionLogo(institutionA, adminAuthA, adminUserIdA, fileOwnedByB.id)
    ).rejects.toThrow(/does not belong to this institution/);

    // A's logo_file_id is untouched by the rejected attempt (still whatever
    // the previous describe block left it as — the "wrong entity_type" file).
    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.logoFileId).not.toBe(fileOwnedByB.id);
  });
});

describe("removing a logo", () => {
  it("updateInstitutionLogo(..., null) clears it everywhere", async () => {
    await updateInstitutionLogo(institutionA, adminAuthA, adminUserIdA, null);

    const institution = await getInstitution(institutionA, adminAuthA);
    expect(institution?.logoFileId).toBeNull();

    const publicSummary = await getInstitutionPublicSummaryByCode(codeA);
    expect(publicSummary?.hasLogo).toBe(false);
    expect(await getPublicLogoFile(codeA)).toBeNull();
  });
});

describe("tenant isolation", () => {
  it("institution B setting its OWN valid public logo works and never affects A", async () => {
    const bLogo = await uploadFile(institutionB, adminAuthB, adminUserIdB, {
      entityType: "institution_logo", entityId: institutionB,
      fileName: "b-real-logo.png", mimeType: "image/png", isPublic: true,
      bytes: Buffer.from("b-bytes"),
    });
    await updateInstitutionLogo(institutionB, adminAuthB, adminUserIdB, bLogo.id);

    const fileForB = await getPublicLogoFile(codeB);
    expect(fileForB).toMatchObject({ fileName: "b-real-logo.png" });

    // Institution A still has no logo (cleared in the previous describe block).
    expect(await getPublicLogoFile(codeA)).toBeNull();
    const institutionAAfter = await getInstitution(institutionA, adminAuthA);
    expect(institutionAAfter?.logoFileId).toBeNull();
  });
});
