/**
 * Google Drive storage per institution (migration 0073): token sealing,
 * signed OAuth state, uploads going to the connected Drive (logo excepted),
 * streaming back, moving existing files, and refusing to disconnect while
 * files are still in Drive. Google's endpoints are faked with a stub fetch.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client";
process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_DRIVE_TOKEN_KEY = "test-token-key-for-drive";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { encryptToken, decryptToken, signState, verifyState, buildAuthUrl } from "../../services/storage/google-drive";
import { saveDriveConnection, getDriveStatus, removeDriveConnection, getDriveConnection } from "../../services/storage/institution-storage";
import { uploadFile, resolveFileForServing, deleteFile } from "../../services/storage/file-service";
import { migrateInstitutionFiles } from "../../services/storage/migration-job";

// ── a tiny fake of the Google token + Drive endpoints ──
const driveFiles = new Map<string, Buffer>();
let nextId = 1;
const realFetch = globalThis.fetch;
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
  if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
    const body = Buffer.from(init!.body as Buffer);
    const boundary = /boundary=(\S+)/.exec(String((init!.headers as Record<string, string>)["Content-Type"]))![1];
    const parts = body.toString("latin1").split(`--${boundary}`);
    const media = parts[2].slice(parts[2].indexOf("\r\n\r\n") + 4, -2);
    const id = `drv${nextId++}`;
    driveFiles.set(id, Buffer.from(media, "latin1"));
    return new Response(JSON.stringify({ id }), { status: 200 });
  }
  const m = /drive\/v3\/files\/([^?]+)/.exec(url);
  if (m && init?.method === "DELETE") { driveFiles.delete(m[1]); return new Response(null, { status: 204 }); }
  if (m && url.includes("alt=media")) {
    const b = driveFiles.get(m[1]);
    return b ? new Response(new Uint8Array(b), { status: 200 }) : new Response("not found", { status: 404 });
  }
  return realFetch(input, init);
});

let A: string, auth: string, uid: string;

beforeAll(async () => {
  globalThis.fetch = fakeFetch as unknown as typeof fetch;
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  A = await seedDemoInstitution(db, "gd-a");
  const admin = await seedDemoUser(db, A, "admin@gd-a.example", "Admin", "institution_admin");
  auth = admin.authUserId; uid = admin.userId;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("tokens and state", () => {
  it("seals refresh tokens and rejects tampering", () => {
    const sealed = encryptToken("1//refresh-token");
    expect(sealed).not.toContain("refresh-token");
    expect(decryptToken(sealed)).toBe("1//refresh-token");
    const parts = sealed.split("."); parts[3] = parts[3].slice(0, -2) + "AA";
    expect(() => decryptToken(parts.join("."))).toThrow();
  });
  it("signs the OAuth state and rejects a forged one", () => {
    const s = signState({ institutionId: A, userId: uid, nonce: "n1" });
    expect(verifyState(s)).toEqual({ institutionId: A, userId: uid, nonce: "n1" });
    expect(verifyState(s.replace(/.$/, s.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(verifyState(signState({ institutionId: A, userId: uid, nonce: "n" }, -5))).toBeNull(); // expired
    expect(buildAuthUrl("https://x/cb", s)).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file");
  });
});

describe("files in the institution's Drive", () => {
  let localFile: string;
  it("before connecting, uploads stay in the app's storage", async () => {
    const f = await uploadFile(A, auth, uid, { entityType: "achievements", fileName: "before.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-before") });
    expect(f.storage_provider).toBe("local");
    localFile = f.id;
  });

  it("after connecting, new uploads go to Drive (not the logo) and stream back", async () => {
    await saveDriveConnection(A, auth, uid, { email: "office@school.example", folderId: "folder1", refreshToken: "1//rt" });
    expect((await getDriveConnection(A, auth))!.refreshToken).toBe("1//rt");
    const f = await uploadFile(A, auth, uid, { entityType: "achievements", fileName: "cert.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-cert") });
    expect(f.storage_provider).toBe("google_drive");
    const served = await resolveFileForServing(A, auth, f.id);
    expect(served && "bytes" in served && served.bytes.toString()).toBe("%PDF-cert");
    const logo = await uploadFile(A, auth, uid, { entityType: "institution_logo", fileName: "logo.png", mimeType: "image/png", bytes: Buffer.from("png") });
    expect(logo.storage_provider).toBe("local");
  });

  it("moves existing files to Drive, and won't disconnect while files are there", async () => {
    const r = await migrateInstitutionFiles(A, auth, uid, "google_drive");
    expect(r.failed).toEqual([]);
    expect(r.migrated).toBe(1); // before.pdf; the logo is skipped
    const status = await getDriveStatus(A, auth);
    expect(status).toMatchObject({ email: "office@school.example", folderId: "folder1", filesOnDrive: 2 });
    const served = await resolveFileForServing(A, auth, localFile);
    expect(served && "bytes" in served && served.bytes.toString()).toBe("%PDF-before");
    await expect(removeDriveConnection(A, auth, uid)).rejects.toThrow(/still in Google Drive/);

    const back = await migrateInstitutionFiles(A, auth, uid, "local");
    expect(back.failed).toEqual([]);
    expect(driveFiles.size).toBe(0);
    await removeDriveConnection(A, auth, uid);
    expect(await getDriveStatus(A, auth)).toBeNull();
  });

  it("deleting a Drive file removes it from Drive", async () => {
    await saveDriveConnection(A, auth, uid, { email: null, folderId: "folder2", refreshToken: "1//rt2" });
    const f = await uploadFile(A, auth, uid, { entityType: "skill_submissions", fileName: "x.png", mimeType: "image/png", bytes: Buffer.from("img") });
    expect(driveFiles.size).toBe(1);
    await deleteFile(A, auth, uid, f.id);
    expect(driveFiles.size).toBe(0);
  });
});
