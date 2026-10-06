-- =============================================================================
-- PROMPT EDU ERP — Migration 0059: Learner Record entries.
--
-- Backs the international-standard Learner Record (IB Learner Profile / HEAR /
-- IMS CLR style) shown in the student & parent portals. One generic table keeps
-- the schema small: each row belongs to a `section`, and the portals only
-- render a section once at least one row exists — nothing shows blank.
--
--   quran            Hifz / tajweed / recitation / Arabic progress
--   language         Language proficiency (e.g. English B2)
--   certification    External certificates & exams
--   activity         Service, leadership, clubs, co-curricular (hours optional)
--   health           Fitness & wellbeing (non-diagnostic: height, fitness test…)
--   house_points     House / points history
--   teacher_comment  Term narrative comments from teachers
--   reflection       Student's own reflection
--   goal             Next-term goal (teacher or student)
-- =============================================================================

create table learner_record_entries (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  section          text not null check (section in (
                     'quran','language','certification','activity','health',
                     'house_points','teacher_comment','reflection','goal')),
  title            text not null,
  detail           text,
  value            text,
  level            text,
  period           text,
  hours            numeric(7,2),
  entry_date       date not null default current_date,
  evidence_file_id uuid references files(id) on delete set null,
  entered_by       uuid references users(id) on delete set null,
  entered_by_role  text not null default 'staff' check (entered_by_role in ('staff','student')),
  created_at       timestamptz not null default now()
);

create index idx_learner_record_entries_student on learner_record_entries(institution_id, student_id, section, entry_date desc);

alter table learner_record_entries enable row level security;

create policy tenant_isolation_select on learner_record_entries for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_insert on learner_record_entries for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_update on learner_record_entries for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_delete on learner_record_entries for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
