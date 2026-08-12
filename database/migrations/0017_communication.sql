-- =============================================================================
-- PROMPT EDU ERP — Migration 0017: Communication (announcements + notifications)
-- ARCHITECTURE.md §D.13, §G.4 (NotificationService is a core service every
-- module can depend on), §R.4 (push is a progressive enhancement; in-app +
-- email always fire so no institution depends on push actually working on
-- every device), Phase 15 (§AA.2).
--
-- notifications.user_id is who a row is ABOUT (the recipient), which is
-- essentially always someone OTHER than the acting user who triggered it
-- (an admin publishing an announcement, an admin approving someone else's
-- leave). RLS here only enforces the institution-level dual gate, same as
-- every other table — it does NOT restrict a row to being selectable only
-- by its own recipient, because Postgres RLS has no built-in "is the
-- current session this row's user_id" primitive without a subquery against
-- `users` on every read, and this build already has an established,
-- documented pattern for exactly this shape of problem (mentoring
-- confidentiality, migration 0013; portal self-scoping, migration 0014):
-- enforce "these are MY OWN rows" in the application layer, not RLS.
-- services/notification/notification-service.ts's listMyNotifications()
-- always filters by the CALLER's own server-resolved userId, never a
-- client-supplied id — so nobody can read another user's notifications
-- through the real application, even though the RLS policy alone would
-- technically permit any institution member to query the table directly.
-- =============================================================================

create table announcements (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  title            text not null,
  body             text not null,
  audience_jsonb   jsonb not null, -- {"type":"all"} | {"type":"role","roleCodes":[...]}
  published_by     uuid,
  published_at     timestamptz not null default now()
);

create index idx_announcements_institution on announcements(institution_id, published_at desc);

create table notifications (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references institutions(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  type                text not null,
  title               text not null,
  body                text not null,
  channel             text not null,
  status              text not null default 'pending',
  related_entity_type text,
  related_entity_id   uuid,
  sent_at             timestamptz,
  read_at             timestamptz,
  created_at          timestamptz not null default now(),
  check (channel in ('in_app', 'email', 'sms', 'whatsapp', 'push')),
  check (status in ('pending', 'sent', 'failed', 'skipped'))
);

create index idx_notifications_user on notifications(institution_id, user_id, created_at desc);
create index idx_notifications_unread on notifications(institution_id, user_id, read_at) where channel = 'in_app';

do $$
declare
  t text;
  comm_tables text[] := array['announcements', 'notifications'];
begin
  foreach t in array comm_tables loop
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
