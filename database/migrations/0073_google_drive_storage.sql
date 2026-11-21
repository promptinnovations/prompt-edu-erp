-- =============================================================================
-- PROMPT EDU ERP — Migration 0073: Google Drive file storage per institution
-- ("let the database remain in Supabase only — build Google Drive
-- attachment, so that each institute can keep their data in that").
--
-- The database stays in Supabase. An institution may connect ITS OWN Google
-- Drive (Storage page → Connect Google Drive); from then on new uploads —
-- photos, certificates, documents — are stored in a folder in that Drive,
-- and existing files can be moved there. The institution logo stays in the
-- app's own storage (it is needed before sign-in and for the app icon).
--
--   institution_storage — one row per institution that connected a Drive:
--     the Google account, the app's folder id, and the OAuth refresh token
--     (AES-256-GCM encrypted with GOOGLE_DRIVE_TOKEN_KEY; never readable
--     from the database alone).
--   files.storage_provider may now be 'google_drive' (storage_file_id = the
--     Drive file id).
-- =============================================================================

alter table files drop constraint if exists files_storage_provider_check;
alter table files add constraint files_storage_provider_check
  check (storage_provider in ('local', 'supabase', 'google_drive'));

create table institution_storage (
  institution_id        uuid primary key references institutions(id) on delete cascade,
  provider              text not null default 'google_drive',
  drive_account_email   text,
  drive_folder_id       text not null,
  refresh_token_enc     text not null,
  connected_by          uuid references users(id),
  connected_at          timestamptz not null default now(),
  check (provider in ('google_drive'))
);

alter table institution_storage enable row level security;
create policy tenant_isolation_select on institution_storage for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_insert on institution_storage for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_update on institution_storage for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_delete on institution_storage for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
