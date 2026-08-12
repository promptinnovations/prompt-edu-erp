/**
 * PROMPT EDU ERP — SupabaseStorageProvider (production storage backend,
 * §T/§V). Mirrors services/auth/supabase-auth-provider.ts's connection
 * pattern (service-role client, server-only — §X.1).
 *
 * Bucket "institution-files" is created on first use if it doesn't already
 * exist (ensureBucket()) rather than assumed pre-provisioned, so a fresh
 * Supabase project needs no manual dashboard step before this build works
 * end to end. Signed URLs (1 hour TTL) are used for downloads rather than
 * relying on public bucket access, since institution files are not
 * generally public (files.is_public exists for the cases that are).
 */
import { createClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./storage-provider";

const BUCKET = "institution-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

let bucketEnsured = false;

export function createSupabaseStorageProvider(): StorageProvider {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const client = createClient(url, serviceRoleKey);

  async function ensureBucket() {
    if (bucketEnsured) return;
    const { data: existing } = await client.storage.getBucket(BUCKET);
    if (!existing) {
      await client.storage.createBucket(BUCKET, { public: false });
    }
    bucketEnsured = true;
  }

  return {
    name: "supabase",
    async upload(key, bytes, mimeType) {
      await ensureBucket();
      const { error } = await client.storage.from(BUCKET).upload(key, bytes, {
        contentType: mimeType ?? undefined,
        upsert: true,
      });
      if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
      return { storageFileId: key, fileUrl: null }; // not a public bucket — always resolve via getDownloadUrl()'s signed URL
    },
    async download(storageFileId) {
      await ensureBucket();
      const { data, error } = await client.storage.from(BUCKET).download(storageFileId);
      if (error || !data) throw new Error(`Supabase Storage download failed: ${error?.message ?? "no data"}`);
      return Buffer.from(await data.arrayBuffer());
    },
    async getDownloadUrl(storageFileId) {
      await ensureBucket();
      const { data, error } = await client.storage
        .from(BUCKET)
        .createSignedUrl(storageFileId, SIGNED_URL_TTL_SECONDS);
      if (error || !data) throw new Error(`Supabase Storage signed URL failed: ${error?.message ?? "no data"}`);
      return data.signedUrl;
    },
    async remove(storageFileId) {
      await ensureBucket();
      await client.storage.from(BUCKET).remove([storageFileId]);
    },
  };
}
