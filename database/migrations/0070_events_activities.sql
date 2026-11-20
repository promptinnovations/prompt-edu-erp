-- =============================================================================
-- PROMPT EDU ERP — Migration 0070: Events & Activities module.
--
-- "Build Events & Activities module" (sold as one of the 7 main modules on
-- the price chart: enrolment, judgement, house leader board, individual
-- champion, results of children added to their portal).
--
--   houses                  — an institution's houses (teams), with a colour.
--   student_houses          — which house each student is in, per year.
--   activity_events         — an umbrella event ("Arts Fest 2026", "Sports
--                             Day"), with a status that drives what can
--                             happen: draft → enrolment_open →
--                             enrolment_closed → judging → published.
--   activity_items          — the competitions inside an event ("Elocution
--                             – Senior", "4×100 m relay"), individual or
--                             group, eligible classes, points per position
--                             and per grade, judging criteria.
--   activity_entries        — one participant unit in an item: a student
--                             (individual) or a team (group), with its house
--                             and an entry (chest) number.
--   activity_entry_members  — the students in an entry.
--   activity_judges         — staff assigned to judge an item.
--   activity_scores         — one judge's mark for one entry on one
--                             criterion.
--   activity_results        — computed per entry: average score, position
--                             (1st/2nd/3rd, ties share), grade (A/B/C by
--                             percentage), points. Shown in the portals only
--                             once the event is published.
--
-- House leader board = sum of entry points per house; individual champion =
-- sum of a student's points from INDIVIDUAL items (per stage and boys /
-- girls), both computed on read from activity_results.
-- =============================================================================

create table houses (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  name            text not null,
  color           text not null default '#0f766e',
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (institution_id, name)
);

create table student_houses (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  student_id        uuid not null references students(id) on delete cascade,
  academic_year_id  uuid not null references academic_years(id) on delete cascade,
  house_id          uuid not null references houses(id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (student_id, academic_year_id)
);
create index idx_student_houses_house on student_houses(institution_id, house_id);

create table activity_events (
  id                    uuid primary key default gen_random_uuid(),
  institution_id        uuid not null references institutions(id) on delete cascade,
  academic_year_id      uuid not null references academic_years(id) on delete cascade,
  name                  text not null,
  kind                  text not null default 'arts',
  description           text,
  start_date            date,
  end_date              date,
  status                text not null default 'draft',
  max_items_per_student int,               -- null = no limit
  grade_a_min           numeric(5,2) not null default 70,
  grade_b_min           numeric(5,2) not null default 60,
  grade_c_min           numeric(5,2) not null default 50,
  published_at          timestamptz,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (kind in ('arts', 'sports', 'academic', 'literary', 'other')),
  check (status in ('draft', 'enrolment_open', 'enrolment_closed', 'judging', 'published')),
  check (grade_a_min >= grade_b_min and grade_b_min >= grade_c_min)
);
create index idx_activity_events_inst_year on activity_events(institution_id, academic_year_id);

create table activity_items (
  id                         uuid primary key default gen_random_uuid(),
  institution_id             uuid not null references institutions(id) on delete cascade,
  event_id                   uuid not null references activity_events(id) on delete cascade,
  name                       text not null,
  category                   text,
  participation              text not null default 'individual',
  team_size_max              int,
  eligible_class_ids         uuid[],         -- null = every class
  gender                     text,           -- null = open, else 'male' / 'female'
  max_entries_per_house      int,            -- null = no limit
  criteria                   text[] not null default array['Overall'],
  max_mark_per_criterion     numeric(6,2) not null default 10,
  points_first               numeric(6,2) not null default 5,
  points_second              numeric(6,2) not null default 3,
  points_third               numeric(6,2) not null default 1,
  points_grade_a             numeric(6,2) not null default 5,
  points_grade_b             numeric(6,2) not null default 3,
  points_grade_c             numeric(6,2) not null default 1,
  sort_order                 int not null default 0,
  created_at                 timestamptz not null default now(),
  unique (event_id, name),
  check (participation in ('individual', 'group')),
  check (gender is null or gender in ('male', 'female')),
  check (max_mark_per_criterion > 0)
);
create index idx_activity_items_event on activity_items(institution_id, event_id);

create table activity_entries (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  item_id         uuid not null references activity_items(id) on delete cascade,
  house_id        uuid references houses(id) on delete set null,
  entry_no        int not null,
  team_name       text,
  status          text not null default 'enrolled',
  enrolled_by     uuid references users(id),
  created_at      timestamptz not null default now(),
  unique (item_id, entry_no),
  check (status in ('enrolled', 'withdrawn', 'absent'))
);
create index idx_activity_entries_item on activity_entries(institution_id, item_id);

create table activity_entry_members (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  entry_id        uuid not null references activity_entries(id) on delete cascade,
  item_id         uuid not null references activity_items(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  unique (item_id, student_id)
);
create index idx_activity_entry_members_student on activity_entry_members(institution_id, student_id);

create table activity_judges (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  item_id         uuid not null references activity_items(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  unique (item_id, user_id)
);

create table activity_scores (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  entry_id        uuid not null references activity_entries(id) on delete cascade,
  judge_user_id   uuid not null references users(id) on delete cascade,
  criterion       text not null,
  mark            numeric(6,2) not null,
  updated_at      timestamptz not null default now(),
  unique (entry_id, judge_user_id, criterion),
  check (mark >= 0)
);

create table activity_results (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  item_id         uuid not null references activity_items(id) on delete cascade,
  entry_id        uuid not null references activity_entries(id) on delete cascade unique,
  score_pct       numeric(6,2),
  position        int,
  grade           text,
  points          numeric(6,2) not null default 0,
  computed_at     timestamptz not null default now(),
  check (position is null or position between 1 and 3),
  check (grade is null or grade in ('A', 'B', 'C'))
);
create index idx_activity_results_item on activity_results(institution_id, item_id);

do $$
declare
  t text;
  new_tables text[] := array['houses', 'student_houses', 'activity_events', 'activity_items', 'activity_entries',
                             'activity_entry_members', 'activity_judges', 'activity_scores', 'activity_results'];
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

insert into modules (code, name, description, category, is_core, is_active) values
  ('events', 'Events & Activities', 'Houses, events and competitions, enrolment, judging, house leader board, champions and results in the portals', 'student_life', false, true)
on conflict (code) do nothing;

insert into permissions (code, module, description) values
  ('events.manage',     'events', 'Create events and items, manage houses, enrol any student, assign judges, publish results'),
  ('events.judge',      'events', 'Enter marks for the event items one is assigned to judge'),
  ('events.view',       'events', 'View events, entries, house standings and published results'),
  ('events.enrol_self', 'events', 'Enrol oneself in open event items (students)')
on conflict (code) do nothing;

-- Self-healing per-institution backfill (same pattern as migration 0045).
do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'institution_admin'
       and p.code in ('events.manage', 'events.judge', 'events.view')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'management'
       and p.code in ('events.manage', 'events.judge', 'events.view')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code in ('teacher', 'section_head', 'staff')
       and p.code in ('events.judge', 'events.view')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'student'
       and p.code in ('events.view', 'events.enrol_self')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'parent'
       and p.code = 'events.view'
    on conflict do nothing;
  end loop;
end $$;
