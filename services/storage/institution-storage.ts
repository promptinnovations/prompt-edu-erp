/**
 * Which external storage an institution has connected (migration 0073) —
 * today only its own Google Drive. Tokens are stored encrypted.
 */
import { getDbClient } from "../db/client";
import type { DbClient } from "../db/client";
import { recordAudit } from "../audit/audit-service";
import { decryptToken, encryptToken } from "./google-drive";

export interface DriveConnection { email: string | null; folderId: string; refreshToken: string; connectedAt: string }
export interface DriveStatus { email: string | null; folderId: string; connectedAt: string; filesOnDrive: number }

async function inScope<T>(institutionId: string, authUserId: string, fn: (s: DbClient) => Promise<T>, scoped?: DbClient): Promise<T> {
  if (scoped) return fn(scoped);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, fn);
}

export async function getDriveConnection(institutionId: string, authUserId: string, scoped?: DbClient): Promise<DriveConnection | null> {
  return inScope(institutionId, authUserId, async (s) => {
    const { rows } = await s.query<{ drive_account_email: string | null; drive_folder_id: string; refresh_token_enc: string; connected_at: string }>(
      "select drive_account_email, drive_folder_id, refresh_token_enc, connected_at::text as connected_at from institution_storage where institution_id = $1",
      [institutionId]
    );
    const r = rows[0];
    if (!r) return null;
    return { email: r.drive_account_email, folderId: r.drive_folder_id, refreshToken: decryptToken(r.refresh_token_enc), connectedAt: r.connected_at };
  }, scoped);
}

/** Status for the Storage page — never exposes the token. */
export async function getDriveStatus(institutionId: string, authUserId: string): Promise<DriveStatus | null> {
  return inScope(institutionId, authUserId, async (s) => {
    const { rows } = await s.query<{ drive_account_email: string | null; drive_folder_id: string; connected_at: string; n: number }>(
      `select st.drive_account_email, st.drive_folder_id, st.connected_at::text as connected_at,
              (select count(*) from files f where f.storage_provider = 'google_drive')::int as n
         from institution_storage st where st.institution_id = $1`,
      [institutionId]
    );
    const r = rows[0];
    return r ? { email: r.drive_account_email, folderId: r.drive_folder_id, connectedAt: r.connected_at, filesOnDrive: Number(r.n) } : null;
  });
}

export async function saveDriveConnection(
  institutionId: string, authUserId: string, userId: string,
  input: { email: string | null; folderId: string; refreshToken: string }
): Promise<void> {
  return inScope(institutionId, authUserId, async (s) => {
    await s.query(
      `insert into institution_storage (institution_id, provider, drive_account_email, drive_folder_id, refresh_token_enc, connected_by)
       values ($1, 'google_drive', $2, $3, $4, $5)
       on conflict (institution_id) do update set drive_account_email = excluded.drive_account_email, drive_folder_id = excluded.drive_folder_id,
         refresh_token_enc = excluded.refresh_token_enc, connected_by = excluded.connected_by, connected_at = now()`,
      [institutionId, input.email, input.folderId, encryptToken(input.refreshToken), userId]
    );
    await recordAudit(s, { institutionId, userId, action: "connect", module: "storage", entityType: "institution_storage", entityId: null, after: { provider: "google_drive", email: input.email } });
  });
}

/** Disconnects the Drive. Refused while files still live there — move
 *  them back first, or they would become unreachable. */
export async function removeDriveConnection(institutionId: string, authUserId: string, userId: string): Promise<void> {
  return inScope(institutionId, authUserId, async (s) => {
    const { rows } = await s.query<{ n: number }>("select count(*)::int as n from files where storage_provider = 'google_drive'");
    if (Number(rows[0]?.n) > 0) throw new Error(`${rows[0].n} file(s) are still in Google Drive. Move them back to the app's storage first.`);
    await s.query("delete from institution_storage where institution_id = $1", [institutionId]);
    await recordAudit(s, { institutionId, userId, action: "disconnect", module: "storage", entityType: "institution_storage", entityId: null });
  });
}
