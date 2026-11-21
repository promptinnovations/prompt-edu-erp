/**
 * PROMPT EDU ERP — Google Drive storage for one institution (migration 0073).
 *
 * Each institution connects ITS OWN Google account (Storage → Connect
 * Google Drive). The app asks only for the `drive.file` scope — it can see
 * and change only the files it creates itself, never the rest of the
 * institution's Drive — makes one folder ("EduErp — <institution>") and
 * stores new uploads there. The database stays in Supabase.
 *
 * Platform set-up (once, by Prompt Innovations), as environment variables:
 *   GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET — an OAuth "Web
 *     application" client in Google Cloud with the Drive API enabled and
 *     the redirect URI  https://<app host>/api/storage/google/callback
 *   GOOGLE_DRIVE_TOKEN_KEY — any long random secret; encrypts the stored
 *     refresh tokens (AES-256-GCM) and signs the OAuth state.
 * Without them the Storage page explains that Drive isn't available yet.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { StorageProvider } from "./storage-provider";

const SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export function isGoogleDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_TOKEN_KEY);
}

function secretKey(): Buffer {
  const k = process.env.GOOGLE_DRIVE_TOKEN_KEY;
  if (!k) throw new Error("Google Drive is not set up on this server (GOOGLE_DRIVE_TOKEN_KEY).");
  return createHash("sha256").update(k).digest();
}

/** AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptToken(sealed: string): string {
  const [v, iv, tag, enc] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Stored Google Drive token is unreadable.");
  const d = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

/** Signed, expiring OAuth `state` naming the institution and user. */
export function signState(payload: { institutionId: string; userId: string; nonce: string }, ttlSeconds = 600): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const mac = createHmac("sha256", secretKey()).update(`drive-state.${body}`).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state: string): { institutionId: string; userId: string; nonce: string } | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secretKey()).update(`drive-state.${body}`).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { institutionId: string; userId: string; nonce: string; exp: number };
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return { institutionId: p.institutionId, userId: p.userId, nonce: p.nonce };
  } catch {
    return null;
  }
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always hand back a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

async function tokenRequest(params: Record<string, string>): Promise<{ access_token: string; expires_in: number; refresh_token?: string; id_token?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const why = String(json.error_description ?? json.error ?? res.status);
    throw new Error(why === "invalid_grant" ? "Google Drive access was withdrawn — connect it again on the Storage page." : `Google sign-in failed: ${why}`);
  }
  return json as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
}

/** Exchanges the OAuth code; returns the refresh token and the account email. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; accessToken: string; email: string | null }> {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!t.refresh_token) throw new Error("Google did not return offline access — please try connecting again.");
  let email: string | null = null;
  if (t.id_token) {
    try { email = (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString("utf8")) as { email?: string }).email ?? null; } catch { email = null; }
  }
  return { refreshToken: t.refresh_token, accessToken: t.access_token, email };
}

// Access tokens live ~1 hour; keep one per refresh token in memory.
const tokenCache = new Map<string, { token: string; exp: number }>();
export async function accessTokenFor(refreshToken: string): Promise<string> {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  tokenCache.set(key, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

async function driveFetch(accessToken: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive error ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return res;
}

/** Makes the institution's app folder in the connected Drive. */
export async function createFolder(accessToken: string, name: string): Promise<string> {
  const res = await driveFetch(accessToken, `${DRIVE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** A StorageProvider that keeps files in one institution's Drive folder.
 *  Drive files are private, so they are always streamed through
 *  /api/files/[fileId] (getDownloadUrl is never used for them). */
export function createGoogleDriveProvider(conn: { refreshToken: string; folderId: string }): StorageProvider {
  const token = () => accessTokenFor(conn.refreshToken);
  return {
    name: "google_drive",
    async upload(key, bytes, mimeType) {
      const boundary = `eduerp${randomBytes(12).toString("hex")}`;
      const meta = { name: key.split("/").pop() || key, parents: [conn.folderId], description: `EduErp · ${key}` };
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const res = await driveFetch(await token(), `${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      const json = (await res.json()) as { id: string };
      return { storageFileId: json.id, fileUrl: null };
    },
    async download(storageFileId) {
      const res = await driveFetch(await token(), `${DRIVE}/files/${encodeURIComponent(storageFileId)}?alt=media`);
      if (res.status === 404) throw new Error("This file is no longer in the institution's Google Drive.");
      return Buffer.from(await res.arrayBuffer());
    },
    async getDownloadUrl() {
      throw new Error("Google Drive files are served through /api/files.");
    },
    async remove(storageFileId) {
      await driveFetch(await token(), `${DRIVE}/files/${encodeURIComponent(storageFileId)}`, { method: "DELETE" });
    },
  };
}
