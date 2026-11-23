-- =============================================================================
-- PROMPT EDU ERP — Migration 0075: phone (web-push) subscriptions.
--
-- One row per browser/phone a signed-in person has switched "phone alerts" on
-- for. The notification service sends a push to every row of the target user
-- (the 'push' channel that migration 0017 already allowed). Rows whose phone
-- has uninstalled / revoked the permission are deleted when the push service
-- answers 404/410.
-- =============================================================================

create table push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index idx_push_subscriptions_user on push_subscriptions(institution_id, user_id);

alter table push_subscriptions enable row level security;
create policy tenant_isolation_select on push_subscriptions for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_insert on push_subscriptions for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_update on push_subscriptions for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_delete on push_subscriptions for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
