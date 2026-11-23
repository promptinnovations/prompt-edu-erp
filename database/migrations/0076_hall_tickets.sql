-- =============================================================================
-- PROMPT EDU ERP — Migration 0076: Hall tickets (Examinations sub-module).
--
-- "Admin will feed the timetable of each grade; the system generates a hall
-- ticket for each child — with or without the seating plan, configurable."
--
-- exam_timetable_entries — one row per paper: for an examination and a grade
--   (class), a date, a start (and optional end) time and the subject. A grade
--   may have several papers on one date (sessions). subject_label is what
--   prints on the ticket (a subject name, or free text such as "Malayalam II");
--   subject_id links the subject when it is one of the institution's.
--
-- hall_ticket_settings — one row per institution: what the ticket looks like
--   (title, address/e-mail/phone lines under the letterhead, the instruction
--   list, the signature column) and whether the seat (room / bench / seat from
--   Examinations > Seating Arrangement) prints by default.
-- =============================================================================

create table exam_timetable_entries (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  examination_id  uuid not null references examinations(id) on delete cascade,
  class_id        uuid not null references classes(id) on delete cascade,
  subject_id      uuid references subjects(id) on delete set null,
  subject_label   text not null,
  exam_date       date not null,
  start_time      time not null,
  end_time        time,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  unique (institution_id, examination_id, class_id, exam_date, start_time),
  check (end_time is null or end_time > start_time)
);
create index idx_exam_timetable_entries_exam on exam_timetable_entries(institution_id, examination_id, class_id);

create table hall_ticket_settings (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null unique references institutions(id) on delete cascade,
  ticket_title       text not null default 'ADMISSION TICKET',
  address            text,
  email              text,
  phones             text,
  instructions       text,                       -- one instruction per line; null = built-in default list
  show_signature     boolean not null default true,
  include_seating    boolean not null default false,
  updated_by         uuid references users(id),
  updated_at         timestamptz not null default now()
);

do $$
declare
  t text;
  new_tables text[] := array['exam_timetable_entries', 'hall_ticket_settings'];
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
  ('examinations.halltickets.manage', 'examination', 'Feed exam timetables per grade and generate / print hall tickets')
on conflict (code) do nothing;

do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code in ('institution_admin', 'management')
       and p.code = 'examinations.halltickets.manage'
    on conflict do nothing;
  end loop;
end $$;
