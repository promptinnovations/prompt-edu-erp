-- =============================================================================
-- PROMPT EDU ERP — Migration 0037: Exam type categories, configurable
-- discipline/character CRUD (add/rename/reorder/deactivate), configurable
-- 5-point character rating scale labels, and mentor assignment (admin
-- assigns mentor -> student or mentor -> whole class; mentoring_records
-- writes are then gated to an actual assignment).
--
-- Per the user's explicit spec + AskUserQuestion choice ("Full CRUD: add,
-- rename, reorder, deactivate"):
--   - exam_types gets an optional free-text `category` column (e.g.
--     "Islamic", "Academic") — never a hard-coded enum (§K "no
--     institutional value is ever a literal in application code"); an
--     institution is free to name/group exam types however it wants.
--   - discipline_categories / character_attributes gain is_active +
--     sort_order so they can be deactivated (soft-delete, preserving every
--     historical discipline_record/character_assessment that references
--     them) and reordered, without touching application code.
--   - discipline_records gains severity + action_taken + evidence_photo_file_id
--     columns ("Category -> Severity -> Action Taken -> Remarks -> Date ->
--     Follow-up" — description already IS "Remarks"; evidence_photo_file_id
--     is the "with photos" follow-up, reusing storage_files same as every
--     other file-attachment column in this app rather than inventing a new
--     upload path).
--   - character_rating_labels: configurable label per 1-5 rating point
--     (defaults Outstanding/Very Good/Good/Needs Improvement/Requires
--     Attention are seeded per-institution below, but fully editable).
--   - mentor_assignments: the missing "admin assigns mentor to student or
--     class" link. mentoring_records has no assignment FK of its own (an
--     assignment is checked, not stored per-record — same "resolve at
--     write time" approach migration 0013 already uses for mentor_id).
-- =============================================================================

alter table exam_types
  add column category text; -- free text, e.g. "Islamic", "Academic" — institution's own grouping, optional

alter table discipline_categories
  add column is_active  boolean not null default true,
  add column sort_order integer not null default 0;

alter table character_attributes
  add column is_active  boolean not null default true,
  add column sort_order integer not null default 0;

alter table discipline_records
  add column severity              text,   -- e.g. Low/Medium/High/Critical — free text, institution's own scale
  add column action_taken          text,
  add column evidence_photo_file_id uuid references files(id) on delete set null;

create table character_rating_labels (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  rating           smallint not null,
  label            text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (rating between 1 and 5),
  unique (institution_id, rating)
);

-- mentor_assignments: exactly one of student_id / class_id is set — a
-- mentor is assigned either to one student or to an entire class (every
-- student currently/subsequently enrolled in it), never both at once on the
-- same row (an admin wanting both just creates two rows).
create table mentor_assignments (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  mentor_staff_id  uuid not null references staff(id) on delete cascade,
  student_id       uuid references students(id) on delete cascade,
  class_id         uuid references classes(id) on delete cascade,
  is_active        boolean not null default true,
  assigned_by      uuid references users(id),
  created_at       timestamptz not null default now(),
  check ((student_id is null) <> (class_id is null))
);

create index idx_mentor_assignments_mentor on mentor_assignments(institution_id, mentor_staff_id) where is_active;
create index idx_mentor_assignments_student on mentor_assignments(institution_id, student_id) where is_active;
create index idx_mentor_assignments_class on mentor_assignments(institution_id, class_id) where is_active;

-- Seed the default 5-point label set for every existing institution so
-- listCharacterRatingLabels() always has rows to read/rename rather than
-- needing an in-code fallback default (same "seed, don't hard-code
-- fallback" precedent as attendance_statuses/skill_types).
do $$
declare
  inst record;
  defaults text[] := array['Requires Attention', 'Needs Improvement', 'Good', 'Very Good', 'Outstanding'];
  i int;
begin
  for inst in select id from institutions loop
    for i in 1..5 loop
      insert into character_rating_labels (institution_id, rating, label)
      values (inst.id, i, defaults[i])
      on conflict (institution_id, rating) do nothing;
    end loop;
  end loop;
end $$;

-- RLS for the two new tables — same dual-gate pattern as every prior
-- migration (§E).
do $$
declare
  t text;
  new_tables text[] := array['character_rating_labels', 'mentor_assignments'];
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

-- New permission: mentoring.assign ("admin assigns mentor to student or
-- class" — §355). Institution Admin auto-gets every new non-super_admin
-- permission going forward (super-admin-service.ts's institution-creation
-- grant already selects `p.module <> 'super_admin'`), but that only fires
-- for institutions created AFTER this migration — existing institutions'
-- institution_admin role_permissions rows are backfilled explicitly below,
-- same "new permission needs a backfill, not just a seed insert" lesson
-- this codebase already learned once (see fix for task #212).
insert into permissions (code, module, description) values
  ('mentoring.assign', 'mentoring', 'Assign a mentor to a student or a whole class')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
 where r.code = 'institution_admin' and p.code = 'mentoring.assign'
on conflict do nothing;
