-- =============================================================================
-- PROMPT EDU ERP — Migration 0018: File storage (ARCHITECTURE.md §D.13,
-- §T.1 FileService interface, §U.2 storage migration), Phase 16 (§AA.2).
--
-- Provider set: 'local' | 'supabase' only. The original architecture draft
-- (§T) also named Google Drive as a possible provider; it is deliberately
-- NOT implemented in this build (no `googleapis` dependency, no
-- google-drive-provider.ts) — the FileService/StorageProvider abstraction
-- below is provider-agnostic by design specifically so a google_drive value
-- can be added to this check constraint (via a follow-up migration) and a
-- new provider module dropped in later with zero changes to any calling
-- module, exactly the same shape as every other provider-swap in this
-- codebase (services/auth/auth-service.ts, services/notification/
-- email-provider.ts). See docs/SETUP.md for the concrete follow-up steps.
--
-- files.entity_type/entity_id is a loose polymorphic reference (no FK —
-- mirrors notifications.related_entity_type/related_entity_id in migration
-- 0017) because a file can attach to any of several unrelated tables
-- (achievements, skill_submissions, reports, and future ones) and Postgres
-- has no single-column FK that can point at "one of several tables". The
-- three narrow, entity-specific FKs added below (achievements.
-- certificate_file_id, skill_submissions.evidence_file_id, reports.
-- file_id) are the actual referential-integrity gate for those specific
-- relationships; entity_type/entity_id remains a convenience index for
-- "show me every file attached to this achievement" without needing to
-- already know which column on which table points back.
-- =============================================================================

create table files (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  entity_type      text,
  entity_id        uuid,
  storage_provider text not null,
  storage_file_id  text not null, -- provider-specific handle: local relative path, or Supabase Storage object path
  file_url         text,          -- public URL where the provider exposes one directly (Supabase); null for local (served via /api/files/[fileId])
  file_name        text not null,
  mime_type        text,
  size_bytes       bigint not null default 0,
  uploaded_by      uuid,
  is_public        boolean not null default false,
  created_at       timestamptz not null default now(),
  check (storage_provider in ('local', 'supabase'))
);

create index idx_files_institution on files(institution_id, created_at desc);
create index idx_files_entity on files(institution_id, entity_type, entity_id);
create index idx_files_provider on files(institution_id, storage_provider);

alter table achievements add column certificate_file_id uuid references files(id) on delete set null;
alter table skill_submissions add column evidence_file_id uuid references files(id) on delete set null;
alter table reports add constraint reports_file_id_fkey foreign key (file_id) references files(id) on delete set null;

alter table files enable row level security;

create policy tenant_isolation_select on files for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_insert on files for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_update on files for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_delete on files for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
