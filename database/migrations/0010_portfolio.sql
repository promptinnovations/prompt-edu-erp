-- =============================================================================
-- PROMPT EDU ERP — Migration 0010: Student Portfolio
-- ARCHITECTURE.md §D.10, §L (Student Portfolio Architecture), Phase 8 (§AA.2).
--
-- portfolio_events (§L.1) is an APPEND-ONLY, lightweight event log that
-- references authoritative module records via entity_type/entity_id rather
-- than duplicating their data (§89/§90 of the master spec) — marks stay in
-- marks, achievements stay in achievements, this table only ever stores
-- date/title/description/score/status for timeline rendering.
--
-- §L.3 "Only status='approved' rows ever count toward official score,
-- official portfolio, official reports, and official analytics" — this
-- migration only creates the table; modules/portfolio/service.ts's
-- recordPortfolioEvent() is the single place a row is ever inserted, always
-- with status='approved', called only from an approval workflow (§L.3 "a
-- subscriber that only fires on approval events"). Nothing here or in the
-- application code writes a pending/rejected row to this table — an
-- unapproved submission simply never appears, by construction.
-- =============================================================================

create table portfolio_events (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  event_type       text not null,   -- e.g. "skill_approved", "achievement_approved"
  module           text not null,   -- "skills", "achievements", …
  entity_type      text not null,   -- "skill_submissions", "achievements", …
  entity_id        uuid,
  event_date       date not null default current_date,
  title            text not null,
  description      text,
  status           text not null default 'approved',
  score            numeric(6,2),
  approved_by      uuid,
  approved_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  check (status in ('approved'))
);

create index idx_portfolio_events_student on portfolio_events(institution_id, student_id, event_date desc);
create index idx_portfolio_events_source on portfolio_events(institution_id, module, entity_type, entity_id);

alter table portfolio_events enable row level security;

create policy tenant_isolation_select on portfolio_events for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_insert on portfolio_events for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_update on portfolio_events for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_delete on portfolio_events for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
