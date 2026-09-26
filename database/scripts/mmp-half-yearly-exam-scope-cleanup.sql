-- =============================================================================
-- ONE-OFF DATA CLEANUP — MMP "HALF YEARLY EXAM" per-grade subjects.
-- NOT a migration: run manually (Supabase SQL editor), ONCE, AFTER
-- database/migrations/0056_exam_subject_classes.sql has been applied.
--
--   institution : MADRASATHUL MUHAMMADIYYA, PAPPINIPPARA (code 'mmp')
--                 16885713-a8f9-4b97-adab-53ee73cfc497
--   examination : HALF YEARLY EXAM  8427ae2d-210d-4175-ac4e-e787cb245251
--
-- Problem: the exam has 9 exam_subjects x 11 scoped grades, and before
-- migration 0056 every exam_subject applied to every grade. This makes each
-- (subject, grade) pairing explicit in exam_subject_classes, keeping ONLY:
--   (a) pairs where the grade actually teaches the subject (class_subjects), or
--   (b) any grade with NO class_subjects configured at all (can't judge — kept
--       and reported), or
--   (c) pairs that already have marks entered by students of that grade
--       (kept even if not taught — reported for manual review; NO marks are
--       ever deleted or changed by this script).
-- Then deletes an exam_subjects row only if it ends up linked to no grade AND
-- has no marks at all (none expected: every one of MMP's 9 subjects is taught
-- in at least one scoped grade).
--
-- What it does NOT touch: marks, ce_marks, mark_change_history, exam_classes
-- (scope stays 11 grades), class_subjects, subjects, results, or any other
-- exam/institution. Guarded to abort unless the ids/names above match.
--
-- After running: open the exam in the app and press "Save scope & subjects"
-- once (or save any mark) — that recomputes results so Grade 5's result
-- denominators drop from 9 subjects to its own subjects.
-- =============================================================================

-- ---- 1. DRY RUN (read-only): what will be kept / dropped / flagged ---------
with ex as (select '8427ae2d-210d-4175-ac4e-e787cb245251'::uuid as id),
pairs as (
  select es.id as exam_subject_id, sub.name as subject, c.id as class_id, c.name as grade,
         exists (select 1 from class_subjects cs where cs.class_id = c.id and cs.subject_id = es.subject_id) as taught,
         not exists (select 1 from class_subjects cs where cs.class_id = c.id) as grade_unconfigured,
         (select count(*) from marks m
            join student_enrollments se on se.student_id = m.student_id and se.class_id = c.id
                 and se.status = 'active' and se.academic_year_id = e.academic_year_id
           where m.exam_subject_id = es.id) as marks_in_grade
    from exam_subjects es
    join examinations e on e.id = es.examination_id
    join subjects sub on sub.id = es.subject_id
    join (select distinct class_id from exam_classes where examination_id = (select id from ex)) sc on true
    join classes c on c.id = sc.class_id
   where es.examination_id = (select id from ex)
)
select grade, subject, taught, grade_unconfigured, marks_in_grade,
       case when taught then 'KEEP'
            when grade_unconfigured then 'KEEP (grade has no class_subjects — review)'
            when marks_in_grade > 0 then 'KEEP (NOT TAUGHT BUT HAS MARKS — review manually)'
            else 'DROP' end as action
  from pairs
 order by grade, subject;

-- ---- 2. APPLY ----------------------------------------------------------------
begin;

do $$
declare
  v_inst constant uuid := '16885713-a8f9-4b97-adab-53ee73cfc497';
  v_exam constant uuid := '8427ae2d-210d-4175-ac4e-e787cb245251';
  v_ok boolean;
  r record;
  v_links int;
  v_deleted int := 0;
begin
  select exists (
    select 1 from examinations e join institutions i on i.id = e.institution_id
     where e.id = v_exam and i.id = v_inst and i.code = 'mmp' and upper(e.name) = 'HALF YEARLY EXAM'
  ) into v_ok;
  if not v_ok then raise exception 'Guard failed: exam % is not MMP''s HALF YEARLY EXAM', v_exam; end if;
  if to_regclass('public.exam_subject_classes') is null then
    raise exception 'Apply migration 0056_exam_subject_classes.sql first';
  end if;
  if exists (select 1 from exam_subject_classes where examination_id = v_exam) then
    raise exception 'exam_subject_classes already populated for this exam — already cleaned up (or edited in the new planner); aborting';
  end if;
  if exists (select 1 from examinations where id = v_exam and finalized_at is not null) then
    raise exception 'Exam is finalized — aborting';
  end if;

  -- Flag (never delete) marks entered for a subject a grade doesn't teach.
  for r in
    select sub.name as subject, c.name as grade, count(*) as n
      from marks m
      join exam_subjects es on es.id = m.exam_subject_id
      join examinations e on e.id = es.examination_id
      join subjects sub on sub.id = es.subject_id
      join student_enrollments se on se.student_id = m.student_id and se.status = 'active' and se.academic_year_id = e.academic_year_id
      join classes c on c.id = se.class_id
     where es.examination_id = v_exam
       and exists (select 1 from class_subjects cs where cs.class_id = c.id)
       and not exists (select 1 from class_subjects cs where cs.class_id = c.id and cs.subject_id = es.subject_id)
     group by sub.name, c.name
  loop
    raise notice 'REVIEW: % mark(s) entered for "%" in grade % although class_subjects says it is not taught there — link KEPT, marks untouched', r.n, r.subject, r.grade;
  end loop;

  insert into exam_subject_classes (institution_id, examination_id, exam_subject_id, class_id)
  select v_inst, v_exam, es.id, sc.class_id
    from exam_subjects es
    join examinations e on e.id = es.examination_id
    join (select distinct class_id from exam_classes where examination_id = v_exam) sc on true
   where es.examination_id = v_exam
     and (
       exists (select 1 from class_subjects cs where cs.class_id = sc.class_id and cs.subject_id = es.subject_id)
       or not exists (select 1 from class_subjects cs where cs.class_id = sc.class_id)
       or exists (select 1 from marks m
                    join student_enrollments se on se.student_id = m.student_id and se.class_id = sc.class_id
                         and se.status = 'active' and se.academic_year_id = e.academic_year_id
                   where m.exam_subject_id = es.id)
     )
  on conflict do nothing;
  get diagnostics v_links = row_count;
  raise notice 'Linked % (subject, grade) pairs', v_links;

  for r in select es.id, sub.name from exam_subjects es join subjects sub on sub.id = es.subject_id
            where es.examination_id = v_exam
              and not exists (select 1 from exam_subject_classes esc where esc.exam_subject_id = es.id)
  loop
    if exists (select 1 from marks where exam_subject_id = r.id)
       or exists (select 1 from ce_marks cm join exam_ce_components c on c.id = cm.ce_component_id where c.exam_subject_id = r.id) then
      raise notice 'REVIEW: "%" is taught in no scoped grade but has marks — exam_subject KEPT (it will show no roster until linked in the planner)', r.name;
    else
      delete from exam_subjects where id = r.id;
      v_deleted := v_deleted + 1;
      raise notice 'Removed unused exam subject "%"', r.name;
    end if;
  end loop;
  raise notice 'Done: % exam_subjects removed', v_deleted;
end $$;

-- Final state (the whole APPLY block is one transaction: any exception above
-- aborts it and nothing is changed):
select c.name as grade, string_agg(sub.name, ', ' order by sub.name) as subjects
  from exam_subject_classes esc
  join exam_subjects es on es.id = esc.exam_subject_id
  join subjects sub on sub.id = es.subject_id
  join classes c on c.id = esc.class_id
 where esc.examination_id = '8427ae2d-210d-4175-ac4e-e787cb245251'
 group by c.name, c.sort_order order by c.sort_order;

commit;
