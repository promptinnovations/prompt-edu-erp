-- =============================================================================
-- PROMPT EDU ERP — Migration 0048: Daily Assessment (new Exam Type).
--
-- User's own words: "Add Daily Assessment as a new Exam Type in Exam
-- Create... conducted based on the portion completed that day... the same
-- subject can be assessed on consecutive days... Maintain one monthly
-- Daily Assessment Register. Avoid unnecessary separate tables or
-- modules."
--
-- exam_types.is_daily_assessment: a single boolean flag (not a hard-coded
-- name/code match anywhere in application code, §K) marking whichever
-- exam_types row is "the" Daily Assessment type for an institution. A
-- partial unique index keeps this to at most one per institution — the
-- self-heal in modules/examination/service.ts's listExamTypes() creates it
-- automatically (same "self-heal-on-read" pattern as §419-421's rating
-- labels/achievement config/skill types) so every institution, old or new,
-- sees it in the Exam Type dropdown with no migration backfill loop
-- needed (that backfill-only-reaches-existing-institutions gap was the
-- exact bug fixed for the accounts_staff role earlier this project).
--
-- "One monthly register" is the EXISTING `examinations` table reused
-- as-is: creating an examination whose exam_type is Daily Assessment
-- (via the same Create Examination form/action every other exam type
-- uses) auto-names itself "Daily Assessment — <Month> <Year>" and spans
-- that calendar month (start_date/end_date), and is looked up/reused
-- rather than duplicated if one already exists for the current month
-- (see createExamination()'s special case). No new "register" table.
--
-- daily_assessments: one row per (date, class, subject) session — exactly
-- the "Date, Class, Subject, Portion, Maximum Mark, Status" fields the
-- spec names, linked to the monthly examinations row above. This is the
-- ONE new structural table this feature needs: exam_subjects (migration
-- 0005) can't represent it because its unique(examination_id, subject_id)
-- constraint forbids the same subject appearing twice in one examination —
-- exactly what "same subject assessed on consecutive days" requires.
--
-- daily_assessment_marks: per-student marks against one daily_assessments
-- row — mirrors the shape of `marks` (migration 0005) at daily grain,
-- since `marks.exam_subject_id` can't reference a per-day row either. No
-- draft/submit/verify/approve/lock workflow (unlike `marks`): the spec
-- asks for a simple Status field and same-day entry, not a formal
-- multi-stage approval chain, so entering marks directly flips status to
-- 'completed'.
--
-- Nothing else is stored: the monthly consolidated class-wise result,
-- student daily-performance history, and student/subject/class-wise
-- analysis (all "automatically update... as marks are entered") are pure
-- read-time aggregations over these two tables in
-- modules/examination/service.ts — never a separate materialized/summary
-- table that would need its own update step.
-- =============================================================================

alter table exam_types add column is_daily_assessment boolean not null default false;

create unique index idx_exam_types_one_daily_assessment
  on exam_types(institution_id) where is_daily_assessment = true;

create table daily_assessments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  examination_id    uuid not null references examinations(id) on delete cascade,
  class_id          uuid not null references classes(id) on delete cascade,
  subject_id        uuid not null references subjects(id) on delete cascade,
  assessment_date   date not null,
  portion           text not null,
  max_marks         numeric(6,2) not null default 20,
  status            text not null default 'pending', -- pending (no marks yet) | completed (marks entered)
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (max_marks > 0),
  check (status in ('pending', 'completed'))
);

create index idx_daily_assessments_institution_exam on daily_assessments(institution_id, examination_id);
create index idx_daily_assessments_institution_class_date on daily_assessments(institution_id, class_id, assessment_date);
create index idx_daily_assessments_institution_subject on daily_assessments(institution_id, subject_id);

create table daily_assessment_marks (
  id                    uuid primary key default gen_random_uuid(),
  institution_id        uuid not null references institutions(id) on delete cascade,
  daily_assessment_id   uuid not null references daily_assessments(id) on delete cascade,
  student_id            uuid not null references students(id) on delete cascade,
  marks_obtained        numeric(6,2),
  is_absent             boolean not null default false,
  entered_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (institution_id, daily_assessment_id, student_id)
);

create index idx_daily_assessment_marks_institution_student on daily_assessment_marks(institution_id, student_id);
create index idx_daily_assessment_marks_institution_assessment on daily_assessment_marks(institution_id, daily_assessment_id);

do $$
declare
  t text;
  new_tables text[] := array['daily_assessments', 'daily_assessment_marks'];
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
