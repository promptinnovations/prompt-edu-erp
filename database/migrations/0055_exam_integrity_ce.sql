-- =============================================================================
-- PROMPT EDU ERP — Migration 0055: examination result integrity + Continuous
-- Evaluation (CE). Governs regular examinations ONLY — Daily Assessment
-- (migration 0048) is untouched: nothing below alters exam_types,
-- daily_assessments or daily_assessment_marks, and none of the new columns
-- is read by any Daily Assessment function.
--
-- 1. Overall pass rule (EXAMINATION_SPEC §8):
--      overallPass = (failedSubjects = 0) AND (overallPct >= threshold)
--    threshold = examinations.overall_pass_pct, a per-exam configurable
--    column; NULL means "use the platform default of 50" (resolved in
--    modules/examination/service.ts computeResults(), never re-derived by
--    readers — they read results.is_pass). results.pass_threshold_pct
--    records the threshold actually applied, so a stored is_pass is always
--    explainable from its own row (total_marks / max_total_marks /
--    percentage / pass_threshold_pct / failed_subject_count).
--
-- 2. Grade freeze (§1.6): results stay live-recomputed while an exam is
--    provisional/published (the §CS.4 "Live Result Analysis" behaviour).
--    finalizeExamination() stamps examinations.finalized_at and flips every
--    results row to is_frozen = true — from then on computeResults() skips
--    the exam entirely and its upsert refuses to touch a frozen row, so a
--    later grade-band edit or re-entered mark can never change a finalized
--    student's total/percentage/grade/pass. grade_label/grade_color are
--    snapshotted onto the results row (always written by computeResults(),
--    never changed once frozen) so even renaming/recolouring a band can't
--    alter a finalized report card.
--
-- 3. Absence bookkeeping (§1.1): absent_subject_count — subjects the
--    student was marked absent in (excluded from both total and
--    denominator, i.e. judged only on the subjects actually sat).
--
-- 4. Continuous Evaluation (§2 / §CE). marks is keyed one-row-per
--    (exam_subject, student) with no sub-component table, and a dozen
--    analytics queries read marks.marks_obtained directly as "the subject's
--    mark". Adding CE rows into `marks` would silently pollute every one of
--    them, so CE gets the MINIMAL separate pair of tables instead:
--      exam_ce_components — the CE parts of one exam_subject. TOTAL mode =
--        exactly one component ("CE") whose max_marks is the CE max;
--        COMPONENTS mode = several components whose max_marks sum to the
--        CE max. The CE max is always derived (sum), never stored twice.
--      ce_marks — one row per (component, student); same shape/lifecycle
--        as marks (value | is_absent, draft→…→locked entry_status), so
--        computeResults() treats a CE component exactly like a written
--        paper: same absent/blank/denominator rules, no CE special-case.
--    CE on/off + mode live on examinations (per exam), seeded from the
--    institution defaults on institutions at creation time.
-- =============================================================================

alter table examinations add column overall_pass_pct numeric(5,2)
  check (overall_pass_pct is null or (overall_pass_pct >= 0 and overall_pass_pct <= 100));
alter table examinations add column finalized_at timestamptz;
alter table examinations add column finalized_by uuid;
alter table examinations add column ce_enabled boolean not null default false;
alter table examinations add column ce_mode text not null default 'total'
  check (ce_mode in ('total', 'components'));

alter table institutions add column ce_enabled_default boolean not null default false;
alter table institutions add column ce_mode_default text not null default 'total'
  check (ce_mode_default in ('total', 'components'));

alter table results add column is_frozen boolean not null default false;
alter table results add column frozen_at timestamptz;
alter table results add column pass_threshold_pct numeric(5,2);
alter table results add column absent_subject_count integer not null default 0;
alter table results add column grade_label text;
alter table results add column grade_color text;

create table exam_ce_components (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  exam_subject_id  uuid not null references exam_subjects(id) on delete cascade,
  name             text not null,
  max_marks        numeric(6,2) not null check (max_marks > 0),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (institution_id, exam_subject_id, name)
);

create table ce_marks (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  ce_component_id  uuid not null references exam_ce_components(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  marks_obtained   numeric(6,2),
  is_absent        boolean not null default false,
  entry_status     text not null default 'draft',
  entered_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (institution_id, ce_component_id, student_id)
);

create index idx_exam_ce_components_subject on exam_ce_components(institution_id, exam_subject_id);
create index idx_ce_marks_component on ce_marks(institution_id, ce_component_id);
create index idx_ce_marks_student on ce_marks(institution_id, student_id);

do $$
declare
  t text;
  new_tables text[] := array['exam_ce_components', 'ce_marks'];
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
