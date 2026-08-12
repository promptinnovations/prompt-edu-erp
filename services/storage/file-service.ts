/**
 * PROMPT EDU ERP — FileService (ARCHITECTURE.md §T.1). The public API every
 * module uses for file storage — no module ever imports a StorageProvider
 * directly, exactly the pattern services/notification/notification-service.ts
 * establishes for email/in-app delivery.
 */
import { z } from "zod";
import { getDbClient } from "../db/client";
import type { DbClient } from "../db/client";
import { recordAudit } from "../audit/audit-service";
import { getStorageProvider, getStorageProviderByName } from "./storage-provider";
import type { StorageProvider } from "./storage-provider";
import { assertBelowLimit } from "../limits/limit-service";

export interface FileRecord {
  id: string;
  institution_id: string;
  entity_type: string | null;
  entity_id: string | null;
  storage_provider: string;
  storage_file_id: string;
  file_url: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: string; // bigint comes back as string from pg/pglite
  uploaded_by: string | null;
  is_public: boolean;
  created_at: string;
}

const FILE_COLUMNS =
  "id, institution_id, entity_type, entity_id, storage_provider, storage_file_id, file_url, file_name, mime_type, size_bytes, uploaded_by, is_public, created_at";

function buildKey(institutionId: string, entityType: string | null, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${institutionId}/${entityType ?? "misc"}/${crypto.randomUUID()}-${safeName}`;
}

// §X.1/§X.2 rule 3 "File uploads are validated server-side (type, size)
// regardless of client-side checks" — enforced here, the one place every
// upload path (achievements' certificate field today; any future module)
// funnels through, rather than left to each calling form to remember.
// MAX_UPLOAD_BYTES is env-overridable for institutions with a genuine need
// for larger files (e.g. a scanned multi-page certificate); the allowlist
// intentionally excludes anything executable/script-like — add a type here
// only when a real feature needs it, not preemptively.
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
function getMaxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);

const uploadFileSchema = z.object({
  entityType: z.string().max(100).nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
  fileName: z.string().min(1).max(255),
  // Required (not nullable) — unlike every other optional field here, a
  // missing/empty mime type is refused rather than silently accepted,
  // since it's the one signal this check has to validate file TYPE at all
  // (§X.2 rule 3); every real browser File object populates `.type`.
  mimeType: z.string().min(1, "A file type is required.").max(150).refine(
    (v) => ALLOWED_MIME_TYPES.has(v),
    (v) => ({ message: `File type "${v}" is not allowed.` })
  ),
  isPublic: z.boolean().optional(),
});

export async function uploadFile(
  institutionId: string,
  authUserId: string,
  userId: string,
  input: z.infer<typeof uploadFileSchema> & { bytes: Buffer },
  scopedClient?: DbClient // §Q.1 pattern (modules/academic/service.ts's createClass()) — lets a caller already inside its own
  // transaction (e.g. achievements.submitAchievement()) pass its scoped client through so the file row commits
  // atomically with the record it attaches to, rather than opening a second, independent transaction.
): Promise<FileRecord> {
  const data = uploadFileSchema.parse(input);
  const maxBytes = getMaxUploadBytes();
  if (input.bytes.length > maxBytes) {
    throw new Error(`File exceeds the maximum allowed size of ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
  }
  if (input.bytes.length === 0) {
    throw new Error("Refusing to upload an empty file.");
  }
  // §W.2 — checked against usage BEFORE the upload happens (not after) so a
  // blocked upload never wastes a round trip to the storage provider; this
  // reads current usage (not yet including this file), matching "refuse the
  // action that would exceed the cap" rather than a post-hoc rollback.
  {
    const limitDb = await getDbClient();
    await limitDb.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      await assertBelowLimit(scoped, institutionId, "storage");
    });
  }
  const provider = getStorageProvider();
  const key = buildKey(institutionId, data.entityType ?? null, data.fileName);
  const { storageFileId, fileUrl } = await provider.upload(key, input.bytes, data.mimeType ?? null);

  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<FileRecord>(
      `insert into files (institution_id, entity_type, entity_id, storage_provider, storage_file_id, file_url, file_name, mime_type, size_bytes, uploaded_by, is_public)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning ${FILE_COLUMNS}`,
      [
        institutionId,
        data.entityType ?? null,
        data.entityId ?? null,
        provider.name,
        storageFileId,
        fileUrl,
        data.fileName,
        data.mimeType ?? null,
        input.bytes.length,
        userId,
        data.isPublic ?? false,
      ]
    );
    await recordAudit(scoped, {
      institutionId,
      userId,
      action: "upload",
      module: "storage",
      entityType: "files",
      entityId: rows[0].id,
      after: { fileName: rows[0].file_name, storageProvider: rows[0].storage_provider, sizeBytes: rows[0].size_bytes },
    });
    return rows[0];
  };

  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

export async function getFile(institutionId: string, authUserId: string, fileId: string): Promise<FileRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FileRecord>(`select ${FILE_COLUMNS} from files where id = $1`, [fileId]);
    return rows[0] ?? null;
  });
}

export async function listFiles(
  institutionId: string,
  authUserId: string,
  filters?: { entityType?: string; entityId?: string; storageProvider?: string }
): Promise<FileRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters?.entityType) { params.push(filters.entityType); conditions.push(`entity_type = $${params.length}`); }
    if (filters?.entityId) { params.push(filters.entityId); conditions.push(`entity_id = $${params.length}`); }
    if (filters?.storageProvider) { params.push(filters.storageProvider); conditions.push(`storage_provider = $${params.length}`); }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await scoped.query<FileRecord>(
      `select ${FILE_COLUMNS} from files ${where} order by created_at desc limit 200`,
      params
    );
    return rows;
  });
}

/** local -> internal streaming route (no durable public URL to hand out);
 *  every other provider -> that provider's own (typically signed, TTL'd)
 *  download URL. */
export async function getDownloadUrl(institutionId: string, authUserId: string, fileId: string): Promise<string | null> {
  const file = await getFile(institutionId, authUserId, fileId);
  if (!file) return null;
  if (file.storage_provider === "local") return `/api/files/${file.id}`;
  const provider = getStorageProviderByName(file.storage_provider as "local" | "supabase");
  return provider.getDownloadUrl(file.storage_file_id);
}

/** Used by the /api/files/[fileId] route to stream local-provider bytes
 *  directly (and by moveFile()'s byte-verified copy below). */
export async function downloadFileBytes(institutionId: string, authUserId: string, fileId: string): Promise<{ bytes: Buffer; file: FileRecord } | null> {
  const file = await getFile(institutionId, authUserId, fileId);
  if (!file) return null;
  const provider = getStorageProviderByName(file.storage_provider as "local" | "supabase");
  const bytes = await provider.download(file.storage_file_id);
  return { bytes, file };
}

export async function deleteFile(institutionId: string, authUserId: string, userId: string, fileId: string): Promise<boolean> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FileRecord>(`select ${FILE_COLUMNS} from files where id = $1`, [fileId]);
    if (rows.length === 0) return false;
    const file = rows[0];
    const provider = getStorageProviderByName(file.storage_provider as "local" | "supabase");
    await provider.remove(file.storage_file_id);
    await scoped.query("delete from files where id = $1", [fileId]);
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "storage", entityType: "files", entityId: fileId, before: { fileName: file.file_name } });
    return true;
  });
}

/**
 * §U.2 storage migration: moves ONE file from its current provider to
 * `targetProvider`. Idempotent no-op if the file is already on the target
 * provider. Downloads the full byte content from the CURRENT provider,
 * uploads it to the target under a freshly generated key (providers do not
 * share a key namespace), verifies the target's reported byte length
 * matches files.size_bytes before touching anything else, updates the files
 * row (storage_provider/storage_file_id/file_url) — and ONLY THEN removes
 * the source bytes, so a crash or verification failure midway never leaves
 * a file unreachable under either provider.
 */
export async function moveFile(
  institutionId: string,
  authUserId: string,
  userId: string,
  fileId: string,
  targetProvider: "local" | "supabase"
): Promise<FileRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FileRecord>(`select ${FILE_COLUMNS} from files where id = $1`, [fileId]);
    if (rows.length === 0) return null;
    const file = rows[0];
    if (file.storage_provider === targetProvider) return file; // already there — no-op

    const source: StorageProvider = getStorageProviderByName(file.storage_provider as "local" | "supabase");
    const target: StorageProvider = getStorageProviderByName(targetProvider);

    const bytes = await source.download(file.storage_file_id);
    if (bytes.length !== Number(file.size_bytes)) {
      throw new Error(
        `moveFile: source byte length (${bytes.length}) does not match recorded size_bytes (${file.size_bytes}) for file ${fileId} — aborting migration before touching the target provider.`
      );
    }

    const newKey = buildKey(institutionId, file.entity_type, file.file_name);
    const { storageFileId, fileUrl } = await target.upload(newKey, bytes, file.mime_type);

    // Verify by round-tripping the byte length from the TARGET too, before
    // we commit to it being the file's new home.
    const verifyBytes = await target.download(storageFileId);
    if (verifyBytes.length !== bytes.length) {
      throw new Error(`moveFile: target upload verification failed for file ${fileId} (expected ${bytes.length} bytes, got ${verifyBytes.length}).`);
    }

    const { rows: updated } = await scoped.query<FileRecord>(
      `update files set storage_provider = $1, storage_file_id = $2, file_url = $3 where id = $4 returning ${FILE_COLUMNS}`,
      [target.name, storageFileId, fileUrl, fileId]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "migrate", module: "storage", entityType: "files", entityId: fileId,
      before: { storageProvider: file.storage_provider }, after: { storageProvider: target.name },
    });

    // Only remove the source bytes once the DB row update (inside this same
    // transaction) has succeeded — matches this function's own doc comment
    // and migration-job.ts's per-file independence.
    await source.remove(file.storage_file_id);

    return updated[0];
  });
}
