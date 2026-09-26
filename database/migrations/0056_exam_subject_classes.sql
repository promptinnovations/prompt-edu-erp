-- =============================================================================
-- PROMPT EDU ERP — Migration 0056: per-grade exam subjects.
--
-- User report (MMP "Half Yearly Exam"): "all subjects of the institution is
-- shown for every classes, which is incorrect ... Section > Grades >
-- Divisions - for each grade an option for choosing relevant subject for
-- the exam". Must work for every tenant.
--
-- Root cause: exam_subjects (migration 0005) is keyed per EXAMINATION
-- (unique examination_id, subject_id) with no class dimension, and
-- exam_classes is keyed per class/division with no subject dimension. So
-- every exam_subject implicitly applied to every class in scope — the only
-- narrowing was an after-the-fact class_subjects gate on two reads (marks
-- grid roster + Mark Entry Status), while the subject list, results
-- computation (denominator!), consolidated marks and analysis still
-- treated every subject as belonging to every class.
--
-- exam_subject_classes: which grades (classes) one exam_subject is set for.
-- Written only by the new Section > Grade > Division + per-grade subject
-- planner (modules/examination/service.ts saveExamScopePlan()).
--
-- Resolution rule (examSubjectAppliesToClassSql() — the single resolver):
--   * exam_subject HAS exam_subject_classes rows -> applies to exactly those
--     grades (strict, admin-chosen);
--   * exam_subject has NO rows (exams set up before this migration, or via
--     the legacy addExamSubject() path / bulk import) -> previous behaviour:
--     class_subjects gate, ungated for a grade with no class_subjects at all.
-- Max/pass marks stay on exam_subjects (one value per subject per exam).
-- Daily Assessment (migration 0048) is untouched.
-- =============================================================================

create table exam_subject_classes (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  examination_id   uuid not null references examinations(id) on delete cascade,
  exam_subject_id  uuid not null references exam_subjects(id) on delete cascade,
  class_id         uuid not null references classes(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (institution_id, exam_subject_id, class_id)
);

create index idx_exam_subject_classes_exam on exam_subject_classes(institution_id, examination_id);
create index idx_exam_subject_classes_subject on exam_subject_classes(exam_subject_id, class_id);

do $$
declare
  t text;
  new_tables text[] := array['exam_subject_classes'];
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
