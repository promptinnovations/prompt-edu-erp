-- =============================================================================
-- PROMPT EDU ERP — Migration 0030: institution logo.
--
-- institutions.logo_file_id already existed as a bare, unconstrained uuid
-- column from day one (migration 0001) — a placeholder that was never wired
-- up to anything (no FK, no reader, no writer). This migration doesn't add
-- the column; it makes that pre-existing column real by pointing it at the
-- existing `files` table (migration 0018) rather than re-inventing storage.
-- The upload itself reuses FileService.uploadFile() unchanged
-- (entity_type = 'institution_logo', entity_id = institutionId,
-- is_public = true) — no new upload path, no new storage-provider code.
--
-- `on delete set null` (not cascade): removing the underlying file row (e.g.
-- a future "delete this file" admin action) should silently fall back to the
-- generated letter badge everywhere, never take down institutions.
--
-- No new RLS policy needed — migration 0020's institutions_update_self policy
-- already permits an institution admin to update ANY column on their own row
-- (column-level authorization is enforced at the application layer, same as
-- every other field on this table); the actual write path is the new
-- updateInstitutionLogo() in services/institution/institution-service.ts,
-- reachable only through app/(institution)/settings/actions.ts, gated on the
-- settings.manage permission — identical shape to updateInstitutionBranding().
-- =============================================================================

alter table institutions
  add constraint institutions_logo_file_id_fkey
  foreign key (logo_file_id) references files(id) on delete set null;
