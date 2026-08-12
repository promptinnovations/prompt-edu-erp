-- =============================================================================
-- PROMPT EDU ERP — Migration 0016: Bulk import/export
-- ARCHITECTURE.md §Q (Bulk Import/Export Architecture), Phase 14 (§AA.2).
--
-- import_batches is the staging + audit table for the "upload -> validate
-- -> preview -> confirm -> summary" pipeline (§Q.1). `rows_jsonb` holds the
-- full per-row parse/validation result (row number, status, parsed data,
-- error messages) produced at stage() time, so confirm() never needs the
-- original file re-uploaded or re-parsed — it just re-reads this table,
-- filters to status='valid', and inserts each row inside one transaction
-- (§Q.1's "any row-level failure during commit rolls back that batch").
--
-- There is no separate "export" table: §Q.2 exports are always a live,
-- permission-checked query (either through the Reporting Engine, §P, or a
-- direct raw CSV/XLSX dump of a list screen's current filter state) —
-- nothing about an export is ever staged or persisted server-side, so it
-- needs no schema of its own, only a service function + route handler.
-- =============================================================================

create table import_batches (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  entity_type       text not null,
  filename          text not null,
  status            text not null default 'staged',
  total_rows        int not null default 0,
  valid_rows        int not null default 0,
  invalid_rows      int not null default 0,
  duplicate_rows    int not null default 0,
  imported_rows     int not null default 0,
  rows_jsonb        jsonb not null,
  staged_by         uuid,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  check (status in ('staged', 'confirmed', 'failed'))
);

create index idx_import_batches_institution on import_batches(institution_id, created_at desc);

do $$
declare
  t text;
  import_tables text[] := array['import_batches'];
begin
  foreach t in array import_tables loop
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
