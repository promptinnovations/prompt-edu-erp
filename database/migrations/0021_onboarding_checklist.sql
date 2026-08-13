-- =============================================================================
-- PROMPT EDU ERP — Migration 0021: dashboard onboarding checklist.
--
-- The checklist itself (what items exist, whether each is "done") is NOT
-- stored here — "done" is derived on read by services/onboarding/
-- onboarding-service.ts checking whether real data already exists (a
-- class, a student, a staff member, ...), the same way dashboard stat
-- cards already work. This table only stores the one piece of state that
-- can't be derived: an institution explicitly choosing "skip this / not
-- applicable, ask me later" for an item that isn't done yet. Deleting the
-- row (via unskipOnboardingItem) is how "do it later" becomes "show it
-- again".
--
-- Tenant-isolated with the same institution_id-equality RLS pattern used
-- by every other institution-owned table in this schema (§E.1) — no new
-- pattern introduced.
-- =============================================================================

create table onboarding_skips (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  item_code       text not null,
  skipped_by      uuid,
  skipped_at      timestamptz not null default now(),
  unique (institution_id, item_code)
);

create index idx_onboarding_skips_institution on onboarding_skips(institution_id);

alter table onboarding_skips enable row level security;

create policy tenant_isolation_select on onboarding_skips for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_insert on onboarding_skips for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_delete on onboarding_skips for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
