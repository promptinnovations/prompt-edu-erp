-- =============================================================================
-- PROMPT EDU ERP — Migration 0047: Parent-portal communication (Phase D §3
-- "send a communication to teachers, principals. they also can award
-- flowers or congratulations for teachers and students for performance -
-- it will be shown in their respective portals").
--
-- parent_messages: a parent-initiated message to one staff member (teacher
-- or a principal/management-role user). Deliberately one-way + notification-
-- fed rather than a full threaded-inbox system: sending inserts this row
-- AND calls services/notification/notification-service.ts's notifyUser()
-- so the recipient sees it via the existing NotificationBell (no new
-- inbox UI is load-bearing for delivery), with a dedicated "Messages from
-- parents" list page for staff who want the fuller view + sender context
-- (child's name/class). reply_text/replied_at let the staff member send
-- one reply back (also notified) — kept minimal (single reply, not a full
-- thread) since nothing in the request asks for back-and-forth chat.
--
-- kudos: a parent awarding a "flower" or "congratulations" to a teacher or
-- a student, with an optional message — "shown in their respective
-- portals" means a teacher's own Staff Profile page and a student's own
-- Portfolio/portal page each grow a "Kudos received" section
-- (modules/kudos/service.ts's listKudosForStaff()/listKudosForStudent()).
-- to_student_id is restricted to the parent's OWN child at the service
-- layer (not by a DB constraint — mirrors how e.g. attendance.leave.apply
-- is scoped by application code, not RLS, per this schema's established
-- pattern of keeping RLS to tenant isolation only, §E.1); to_staff_id has
-- no such restriction — a parent may reasonably want to thank any
-- teacher/principal at the institution, not only their child's own.
-- =============================================================================

create table parent_messages (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  from_parent_id     uuid not null references parents(id) on delete cascade,
  about_student_id   uuid references students(id) on delete set null,
  to_user_id         uuid not null references users(id) on delete cascade,
  subject            text not null,
  body               text not null,
  reply_text         text,
  replied_at         timestamptz,
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index idx_parent_messages_institution_to on parent_messages(institution_id, to_user_id);
create index idx_parent_messages_institution_from on parent_messages(institution_id, from_parent_id);

create table kudos (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  from_parent_id     uuid not null references parents(id) on delete cascade,
  to_staff_id        uuid references staff(id) on delete cascade,
  to_student_id      uuid references students(id) on delete cascade,
  kind               text not null default 'flower',
  message            text,
  created_at         timestamptz not null default now(),
  check (kind in ('flower', 'congratulations')),
  check ((to_staff_id is not null)::int + (to_student_id is not null)::int = 1)
);

create index idx_kudos_institution_to_staff on kudos(institution_id, to_staff_id);
create index idx_kudos_institution_to_student on kudos(institution_id, to_student_id);

do $$
declare
  t text;
  new_tables text[] := array['parent_messages', 'kudos'];
begin
  foreach t in array new_tables loop
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

insert into permissions (code, module, description) values
  ('messages.send_to_staff', 'communication', 'Send a message to a teacher/principal (parent)'),
  ('messages.view',          'communication', 'View messages addressed to self as a staff member'),
  ('kudos.send',             'communication', 'Award a flower/congratulations to a teacher or student (parent)')
on conflict (code) do nothing;

-- Self-healing per-institution backfill.
do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'parent'
       and p.code in ('messages.send_to_staff', 'kudos.send')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code in
       ('institution_admin', 'management', 'teacher', 'section_head', 'staff', 'librarian')
       and p.code = 'messages.view'
    on conflict do nothing;
  end loop;
end $$;
