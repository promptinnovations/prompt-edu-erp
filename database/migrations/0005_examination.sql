-- =============================================================================
-- PROMPT EDU ERP — Migration 0005: Examination module
-- ARCHITECTURE.md §D.5 (Examination & marks) / §27-31 of the master spec.
--
-- exam_types is institution-defined CONFIGURATION (§K "no institutional
-- value is ever a literal in application code") — Badrudhuja's "Kithab Main
-- Exam" etc. are seed DATA for that one tenant (see database/scripts/seed.ts
-- seedExaminationDefaults()), never a platform-wide enum.
--
-- grade_scales/grade_bands are likewise per-institution configuration — no
-- grading scale is hard-coded (§30 "never hard-code thresholds").
-- =============================================================================

create table exam_types (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  code             text not null,
  name             text not null,
  created_at       timestamptz not null default now(),
  unique (institution_id, code)
);

create table grade_scales (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  is_default       boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

create table grade_bands (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  grade_scale_id   uuid not null references grade_scales(id) on delete cascade,
  min_percent      numeric(5,2) not null,
  max_percent      numeric(5,2) not null,
  grade_label      text not null,
  grade_point      numeric(4,2)
);

create table examinations (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  exam_type_id       uuid not null references exam_types(id),
  academic_year_id   uuid not null references academic_years(id),
  term_id            uuid references terms(id),
  name               text not null,
  start_date         date,
  end_date           date,
  status             text not null default 'draft', -- draft|scheduled|in_progress|completed|locked
  grade_scale_id     uuid references grade_scales(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table exam_classes (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  examination_id   uuid not null references examinations(id) on delete cascade,
  class_id         uuid not null references classes(id) on delete cascade,
  section_id       uuid references sections(id) on delete cascade,
  unique (institution_id, examination_id, class_id, section_id)
);

create table exam_subjects (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  examination_id   uuid not null references examinations(id) on delete cascade,
  subject_id       uuid not null references subjects(id) on delete cascade,
  max_marks        numeric(6,2) not null default 100,
  pass_marks       numeric(6,2) not null default 35,
  weight           numeric(5,2),
  unique (institution_id, examination_id, subject_id)
);

-- entry_status lifecycle: draft -> submitted -> verified -> approved -> locked
-- (§28 "verification... approval... locking... correction history")
create table marks (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  exam_subject_id  uuid not null references exam_subjects(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  marks_obtained   numeric(6,2),
  is_absent        boolean not null default false,
  remarks          text,
  entry_status     text not null default 'draft',
  entered_by       uuid,
  verified_by      uuid,
  approved_by      uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (institution_id, exam_subject_id, student_id)
);

create table mark_change_history (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  mark_id          uuid not null references marks(id) on delete cascade,
  old_value        numeric(6,2),
  new_value        numeric(6,2),
  changed_by       uuid,
  reason           text,
  changed_at       timestamptz not null default now()
);

create table results (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  examination_id   uuid not null references examinations(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  total_marks      numeric(8,2) not null,
  max_total_marks  numeric(8,2) not null,
  percentage       numeric(5,2) not null,
  grade_band_id    uuid references grade_bands(id),
  rank             integer,
  status           text not null default 'computed', -- computed|published
  computed_at      timestamptz not null default now(),
  unique (institution_id, examination_id, student_id)
);

-- Indexes matching the analytics query patterns in §N.
create index idx_exam_types_institution on exam_types(institution_id);
create index idx_grade_scales_institution on grade_scales(institution_id);
create index idx_grade_bands_scale on grade_bands(institution_id, grade_scale_id);
create index idx_examinations_institution on examinations(institution_id, academic_year_id);
create index idx_exam_classes_institution on exam_classes(institution_id, examination_id);
create index idx_exam_subjects_institution on exam_subjects(institution_id, examination_id);
create index idx_marks_institution on marks(institution_id, exam_subject_id);
create index idx_marks_student on marks(institution_id, student_id);
create index idx_mark_history_mark on mark_change_history(institution_id, mark_id);
create index idx_results_institution on results(institution_id, examination_id);
create index idx_results_student on results(institution_id, student_id);

-- RLS — same dual-gate pattern as 0001 (§E).
do $$
declare
  t text;
  exam_tables text[] := array[
    'exam_types','grade_scales','grade_bands','examinations','exam_classes',
    'exam_subjects','marks','mark_change_history','results'
  ];
begin
  foreach t in array exam_tables loop
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
