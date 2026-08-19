-- =============================================================================
-- PROMPT EDU ERP — Migration 0031: Academic Calendar, Substitution, personal
-- To-do list. Follow-up to the Home page redesign request ("Academic
-- Calendar & Substitution must be another separate Modules — configurations
-- institution wise they will add later"): both are genuine new modules
-- (own `modules` catalogue row, own permission codes, own toggleable
-- institution_modules row — see database/seeds/0001_permissions_and_roles.sql
-- and database/scripts/seed.ts), not folded into Staff/Academic Structure.
--
-- calendar_events: institution-wide events (holiday/exam/meeting/ptm/other),
-- each with a start_date and an optional end_date (so a single row can
-- represent a yearly/termly/monthly-scale entry — "Summer Vacation" is one
-- row spanning weeks, "PTM" is one row with no end_date) — no separate
-- "granularity" column needed, the date range already captures that. Per
-- the explicit follow-up, bulk upload (Excel, yearly/termly/monthly) reuses
-- the existing generic bulk-import engine (modules/bulk/service.ts) rather
-- than a bespoke parser — see the new "calendar_events" entity definition
-- there.
--
-- timetable_periods + staff_substitutions: PERIOD-level, per explicit
-- follow-up ("timetable will be uploaded, arrange free teachers for the
-- engaged classes of the absent teacher... system should generate
-- appropriate subs"). timetable_periods is the institution's weekly grid
-- (one row per class+section+day_of_week+period_no -> subject + teacher),
-- uploaded via the same generic bulk-import engine as everything else
-- (modules/bulk/service.ts's "timetable_periods" entity). No exact clock
-- times are stored — day_of_week+period_no is all the auto-substitution
-- matcher (modules/substitution/service.ts's generateSubstitutionSuggestions)
-- needs to find a "free" teacher at the same slot; an institution's actual
-- period start/end times are a display-only concern for a future settings
-- screen, not something the matching algorithm depends on.
--
-- staff_substitutions is the CONFIRMED record (never the suggestion itself
-- — suggestions are computed on demand and only ever persisted here once an
-- admin reviews/edits and confirms them), one row per (date, class, section,
-- period_no) actually covered — this is what "weekly/monthly reportable,
-- how many subs teachers got" reads from (group by covering_staff_id over a
-- date range).
--
-- user_todos: a personal, per-user checklist ("To do list" on the new Home
-- page). Tenant-isolated with the same institution_id-equality RLS pattern
-- as every other table (§E.1) — deliberately NOT a stricter per-row "owner"
-- RLS policy, matching this schema's existing, documented precedent for
-- per-user rows (see migration 0017's comment on `notifications`): the
-- genuine self-scoping guarantee is enforced at the application layer
-- (services/todo/todo-service.ts always filters by the CALLER's own
-- resolved userId, never a client-supplied one), not by a second RLS
-- policy layered on top of the same institution-level one every table here
-- already has.
-- =============================================================================

create table calendar_events (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  title           text not null,
  description     text,
  event_type      text not null default 'other',
  start_date      date not null,
  end_date        date,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (event_type in ('holiday', 'exam', 'meeting', 'ptm', 'other')),
  check (end_date is null or end_date >= start_date)
);

create index idx_calendar_events_institution_date on calendar_events(institution_id, start_date);

create table timetable_periods (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  class_id          uuid not null references classes(id) on delete cascade,
  section_id        uuid not null references sections(id) on delete cascade,
  day_of_week       smallint not null, -- 1=Monday .. 7=Sunday (ISO 8601)
  period_no         smallint not null,
  subject_id        uuid references subjects(id) on delete set null,
  teacher_staff_id  uuid references staff(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (day_of_week between 1 and 7),
  check (period_no >= 1),
  unique (institution_id, class_id, section_id, day_of_week, period_no)
);

create index idx_timetable_periods_teacher_slot on timetable_periods(institution_id, teacher_staff_id, day_of_week, period_no);

create table staff_substitutions (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  date               date not null,
  period_no          smallint not null,
  class_id           uuid not null references classes(id) on delete cascade,
  section_id         uuid not null references sections(id) on delete cascade,
  subject_id         uuid references subjects(id) on delete set null,
  absent_staff_id    uuid not null references staff(id) on delete cascade,
  covering_staff_id  uuid references staff(id) on delete set null,
  note               text,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (institution_id, date, class_id, section_id, period_no)
);

create index idx_staff_substitutions_institution_date on staff_substitutions(institution_id, date);
create index idx_staff_substitutions_covering on staff_substitutions(institution_id, covering_staff_id, date);

create table user_todos (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  text            text not null,
  is_done         boolean not null default false,
  due_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_user_todos_institution_user on user_todos(institution_id, user_id);

do $$
declare
  t text;
  new_tables text[] := array['calendar_events', 'timetable_periods', 'staff_substitutions', 'user_todos'];
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
