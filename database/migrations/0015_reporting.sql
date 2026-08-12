-- =============================================================================
-- PROMPT EDU ERP — Migration 0015: Reporting engine
-- ARCHITECTURE.md §D.13 (reports), §P (Reporting Architecture), Phase 13
-- (§AA.2).
--
-- report_definitions is a GLOBAL catalog table, same visibility pattern as
-- `modules`/`permissions` (migration 0001): readable by everyone, writable
-- only by Super Admin. §P.2's institution_id column is kept (nullable) for
-- the FUTURE Report Builder (§59, not this phase) where an institution
-- could compose its own report_definitions — every row this build actually
-- seeds has institution_id = null (a platform built-in), so that path is
-- schema-ready but not yet exercised.
--
-- `reports.file_id` per §D.13 references a `files` table that doesn't
-- exist yet (Phase 16: Google Drive storage integration) — kept as a bare
-- nullable uuid, no FK, until that table lands. Until then, generated PDF/
-- XLSX bytes are streamed straight to the requester's download (never
-- written to disk or any storage provider) and this table is purely an
-- audit log of "who generated what, with which parameters, when" — not a
-- retrieval mechanism. Re-downloading means re-generating, which is cheap
-- and always reflects current data anyway (a report is a live query, not a
-- frozen snapshot in this build).
-- =============================================================================

create table report_definitions (
  id                     uuid primary key default gen_random_uuid(),
  institution_id         uuid references institutions(id) on delete cascade,
  code                   text not null unique,
  name                   text not null,
  data_source            text not null,
  base_query_key         text not null,
  columns_jsonb          jsonb not null,
  default_filters_jsonb  jsonb,
  grouping_jsonb         jsonb,
  is_system              boolean not null default true,
  created_at             timestamptz not null default now()
);

create table reports (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  report_type       text not null references report_definitions(code),
  generated_by      uuid,
  parameters_jsonb  jsonb,
  format            text not null default 'pdf',
  file_id           uuid,
  generated_at      timestamptz not null default now(),
  check (format in ('pdf', 'xlsx'))
);

create index idx_reports_institution on reports(institution_id, generated_at desc);

alter table report_definitions enable row level security;
create policy report_definitions_select on report_definitions for select using (true);
create policy report_definitions_write on report_definitions for all
  using (current_setting('app.is_super_admin', true) = 'true')
  with check (current_setting('app.is_super_admin', true) = 'true');

do $$
declare
  t text;
  reporting_tables text[] := array['reports'];
begin
  foreach t in array reporting_tables loop
    execute format('alter table %I enable row level security;', t);

    execute format(
      'create policy tenant_isolation_select on %I for select
         using (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                or current_setting(''app.is_super_admin'', true) = ''true'');', t);

    execute format(
      'create policy tenant_isolation_insert on %I for insert
         with check (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                     or current_setting(''app.is_super_admin'', true) = ''true'');', t);

    execute format(
      'create policy tenant_isolation_update on %I for update
         using (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                or current_setting(''app.is_super_admin'', true) = ''true'')
         with check (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                     or current_setting(''app.is_super_admin'', true) = ''true'');', t);

    execute format(
      'create policy tenant_isolation_delete on %I for delete
         using (institution_id = nullif(current_setting(''app.current_institution_id'', true), '''')::uuid
                or current_setting(''app.is_super_admin'', true) = ''true'');', t);
  end loop;
end $$;
