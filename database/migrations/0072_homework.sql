-- =============================================================================
-- PROMPT EDU ERP — Migration 0072: Homework ("fill gaps in Portal").
--
--   homework       — set by a teacher for a class (one division, or every
--                    division when section_id is null) and a subject, with
--                    a due date.
--   homework_done  — a student's "done" tick (by the student in their
--                    portal, or by the teacher), one row per student per
--                    homework.
--
-- Teachers set homework only for the classes / subjects they are assigned
-- to teach (teacher_assignments); management and admins for any class.
-- Students and parents see it in the portal next to the syllabus progress
-- that teachers already record in their portion plans.
-- =============================================================================

create table homework (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  academic_year_id  uuid not null references academic_years(id) on delete cascade,
  class_id          uuid not null references classes(id) on delete cascade,
  section_id        uuid references sections(id) on delete cascade,
  subject_id        uuid references subjects(id) on delete set null,
  title             text not null,
  details           text,
  assigned_on       date not null default current_date,
  due_date          date not null,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  check (due_date >= assigned_on)
);
create index idx_homework_class on homework(institution_id, class_id, due_date);

create table homework_done (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  homework_id      uuid not null references homework(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  marked_by        uuid references users(id),
  marked_at        timestamptz not null default now(),
  unique (homework_id, student_id)
);
create index idx_homework_done_student on homework_done(institution_id, student_id);

do $$
declare
  t text;
  new_tables text[] := array['homework', 'homework_done'];
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
  ('homework.set',  'academic', 'Set homework for the classes and subjects one teaches (any class for management)'),
  ('homework.view', 'academic', 'See homework and syllabus progress (students, parents, staff)')
on conflict (code) do nothing;

do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code in ('institution_admin', 'management', 'teacher', 'section_head')
       and p.code in ('homework.set', 'homework.view')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code in ('student', 'parent')
       and p.code = 'homework.view'
    on conflict do nothing;
  end loop;
end $$;
