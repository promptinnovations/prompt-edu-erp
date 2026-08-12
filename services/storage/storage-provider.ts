/**
 * PROMPT EDU ERP — StorageProvider abstraction (ARCHITECTURE.md §T.1
 * FileService interface, §U.2 storage migration).
 *
 * Same provider-swap SHAPE as services/auth/auth-service.ts (pick an
 * implementation by which env vars are present), but with plain static
 * imports rather than auth's lazy require() — mirrors the reasoning in
 * services/notification/email-provider.ts: a lazy CJS require() of a
 * relative TS module doesn't resolve reliably under Vitest's ESM
 * transform, and both providers here (@supabase/supabase-js, node:fs) are
 * always-installed dependencies regardless of which env vars are set, so
 * there's nothing to gain from deferring the import.
 *   - SupabaseStorageProvider — real delivery via Supabase Storage, used
 *     whenever NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
 *     configured (the same two vars that switch AuthService over — a real
 *     Supabase project provides both Auth and Storage together).
 *   - LocalFileProvider       — writes to a local `.local-storage/`
 *     directory, used whenever Supabase credentials are absent (this
 *     build's default — no external accounts needed for local dev/test).
 *
 * A `google_drive` provider is intentionally NOT implemented in this build
 * (§D.13 migration note) — this interface is provider-agnostic specifically
 * so one can be added later (a new module + one more branch here + a check
 * constraint update in a follow-up migration) with zero change to any
 * calling module. See docs/SETUP.md.
 */
import { createLocalFileProvider } from "./local-file-provider";
import { createSupabaseStorageProvider } from "./supabase-storage-provider";

export interface StorageProvider {
  readonly name: "local" | "supabase";
  /** Uploads bytes under a caller-chosen relative key (e.g.
   *  `institutionId/entityType/uuid-filename.ext`) and returns the
   *  provider-specific handle to store in files.storage_file_id, plus a
   *  directly-usable URL if the provider exposes one (Supabase); null
   *  otherwise (local — served through /api/files/[fileId] instead). */
  upload(key: string, bytes: Buffer, mimeType: string | null): Promise<{ storageFileId: string; fileUrl: string | null }>;
  /** Returns the raw bytes for a previously-uploaded file. */
  download(storageFileId: string): Promise<Buffer>;
  /** Returns a URL suitable for a browser to fetch the file directly. For
   *  providers with no durable public URL (local), the caller (FileService)
   *  falls back to the internal /api/files/[fileId] route instead of
   *  calling this. */
  getDownloadUrl(storageFileId: string): Promise<string>;
  remove(storageFileId: string): Promise<void>;
}

export function getStorageProvider(): StorageProvider {
  const hasSupabaseConfig =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return hasSupabaseConfig ? createSupabaseStorageProvider() : createLocalFileProvider();
}

/** Used by migrateInstitutionFiles() (§U.2) to construct the TARGET
 *  provider explicitly by name, independent of which provider getStorageProvider()
 *  would currently select — a migration job moves files TO a specific
 *  provider regardless of current env config. */
export function getStorageProviderByName(name: "local" | "supabase"): StorageProvider {
  return name === "supabase" ? createSupabaseStorageProvider() : createLocalFileProvider();
}
