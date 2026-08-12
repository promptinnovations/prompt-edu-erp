/**
 * PROMPT EDU ERP — LocalFileProvider (dev/test fallback storage backend,
 * §T.1). Writes under `.local-storage/` at the project root (gitignored —
 * see docs/SETUP.md), keyed by the same relative path FileService generates
 * for every provider so switching providers later never changes a file's
 * logical identity.
 *
 * `resolvePath()` is a path-traversal guard: every key this module ever
 * receives is FileService-generated (never raw client input), but this
 * check stays as defense-in-depth against a key that somehow contains
 * `..` segments — resolves the joined path and refuses to write/read
 * outside the storage root.
 */
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import type { StorageProvider } from "./storage-provider";

const STORAGE_ROOT = resolve(process.cwd(), ".local-storage");

function resolvePath(key: string): string {
  const full = resolve(STORAGE_ROOT, key);
  const rel = relative(STORAGE_ROOT, full);
  if (rel.startsWith("..") || resolve(rel) === rel) {
    throw new Error(`Refusing to access a path outside local storage root: "${key}"`);
  }
  return full;
}

export function createLocalFileProvider(): StorageProvider {
  return {
    name: "local",
    async upload(key, bytes) {
      const path = resolvePath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      return { storageFileId: key, fileUrl: null };
    },
    async download(storageFileId) {
      return readFile(resolvePath(storageFileId));
    },
    async getDownloadUrl(storageFileId) {
      // Local files have no durable public URL — FileService routes these
      // through /api/files/[fileId] instead (see file-service.ts's
      // getDownloadUrl()), so this is only reached if called directly.
      return `/api/files/local/${encodeURIComponent(storageFileId)}`;
    },
    async remove(storageFileId) {
      await rm(resolvePath(storageFileId), { force: true });
    },
  };
}
