/**
 * PROMPT EDU ERP — storage migration job (ARCHITECTURE.md §U.2). Moves every
 * file NOT already on `targetProvider` to it, one file at a time via
 * moveFile(). Deliberately NOT one all-or-nothing transaction (unlike bulk
 * import's confirmImport(), modules/bulk/service.ts) — each file's
 * migration talks to an external network provider that can fail
 * independently of any other file (timeout, quota, transient network
 * error), so one failure should not roll back files that already migrated
 * successfully. Every file is attempted; failures are collected and
 * returned rather than thrown, so a partial run is still visible/actionable
 * (see app/(institution)/storage/MigrateStorageForm.tsx's summary).
 */
import { listFiles, moveFile } from "./file-service";



export interface MigrationResult {
  totalConsidered: number;
  migrated: number;
  alreadyOnTarget: number;
  failed: Array<{ fileId: string; fileName: string; error: string }>;
}

export async function migrateInstitutionFiles(
  institutionId: string,
  authUserId: string,
  userId: string,
  targetProvider: "local" | "supabase"
): Promise<MigrationResult> {
  // Re-fetch the full file list every iteration is unnecessary — files
  // are listed once up front (bounded at 200 per listFiles(), matching the
  // rest of this build's simple list-screen pagination story) and migrated
  // one by one against the live DB, so any file inserted mid-run is simply
  // picked up by the NEXT invocation, not silently dropped.
  const files = await listFiles(institutionId, authUserId);

  const result: MigrationResult = { totalConsidered: files.length, migrated: 0, alreadyOnTarget: 0, failed: [] };

  for (const file of files) {
    if (file.storage_provider === targetProvider) {
      result.alreadyOnTarget += 1;
      continue;
    }
    try {
      await moveFile(institutionId, authUserId, userId, file.id, targetProvider);
      result.migrated += 1;
    } catch (err) {
      result.failed.push({ fileId: file.id, fileName: file.file_name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

