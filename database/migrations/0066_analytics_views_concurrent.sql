-- =============================================================================
-- PROMPT EDU ERP — Migration 0066: faster, non-blocking analytics views.
--
-- §Perf ("it gets slow on and often"). refresh_analytics_views() rebuilds
-- both materialized views for EVERY institution and, being a plain
-- (non-concurrent) refresh, takes an ACCESS EXCLUSIVE lock on each view —
-- every analytics read in every school waits until the rebuild finishes.
-- It ran after every mark save. This migration:
--
--  1. Fixes mv_exam_subject_stats' join. It joined exam_classes on the
--     examination only and then every mark of the subject, so each class
--     row aggregated the marks of ALL classes: per-class stats were wrong
--     (every class showed the whole exam's numbers) and the work grew with
--     classes x marks. Marks now count only for students enrolled in that
--     class (and division, when the exam_class names one) in the exam's
--     academic year.
--  2. Adds a unique index to each view so it can be refreshed
--     CONCURRENTLY — readers keep reading the previous contents while the
--     refresh runs, instead of blocking.
--  3. Switches refresh_analytics_views() to REFRESH ... CONCURRENTLY.
--
-- The app side (modules/analytics/service.ts, modules/examination/
-- service.ts) now runs the refresh after the response and coalesces bursts.
-- =============================================================================

drop materialized view if exists mv_exam_subject_stats;

create materialized view mv_exam_subject_stats as
select
  es.institution_id,
  es.examination_id,
  es.subject_id,
  ec.class_id,
  ec.section_id,
  ec.id as exam_class_id,
  count(m.id) filter (where m.marks_obtained is not null and not m.is_absent) as marked_count,
  avg(m.marks_obtained) filter (where m.marks_obtained is not null and not m.is_absent) as avg_marks,
  count(m.id) filter (where m.marks_obtained is not null and not m.is_absent and m.marks_obtained >= es.pass_marks) as pass_count,
  stddev_pop(m.marks_obtained) filter (where m.marks_obtained is not null and not m.is_absent) as spread
from exam_subjects es
join examinations e on e.id = es.examination_id
join exam_classes ec on ec.examination_id = es.examination_id
left join marks m
  on m.exam_subject_id = es.id
 and exists (
       select 1 from student_enrollments se
        where se.student_id = m.student_id
          and se.academic_year_id = e.academic_year_id
          and se.class_id = ec.class_id
          and (ec.section_id is null or se.section_id = ec.section_id)
     )
group by es.institution_id, es.examination_id, es.subject_id, ec.class_id, ec.section_id, ec.id;

-- Grouping key, hence unique by construction (required for CONCURRENTLY).
create unique index ux_mv_exam_subject_stats on mv_exam_subject_stats(examination_id, subject_id, exam_class_id);
create index idx_mv_exam_subject_stats_institution on mv_exam_subject_stats(institution_id, examination_id);

drop materialized view if exists mv_attendance_monthly;

create materialized view mv_attendance_monthly as
select
  ar.institution_id,
  ar.student_id,
  ar.class_id,
  ar.section_id,
  -- Non-null stand-in for section_id so the unique index below never has
  -- to compare NULLs.
  coalesce(ar.section_id, '00000000-0000-0000-0000-000000000000'::uuid) as section_key,
  date_trunc('month', ar.date)::date as month,
  count(*) filter (where st.counts_as_present) as present_days,
  count(*) filter (where ar.is_late) as late_days,
  count(*) as total_days
from attendance_records ar
join attendance_statuses st on st.id = ar.status_id
group by ar.institution_id, ar.student_id, ar.class_id, ar.section_id, date_trunc('month', ar.date);

create unique index ux_mv_attendance_monthly on mv_attendance_monthly(institution_id, student_id, class_id, section_key, month);
create index idx_mv_attendance_monthly_institution on mv_attendance_monthly(institution_id, student_id, month);
create index idx_mv_attendance_monthly_class on mv_attendance_monthly(institution_id, class_id, month);

create or replace function refresh_analytics_views() returns void as $$
begin
  refresh materialized view concurrently mv_exam_subject_stats;
  refresh materialized view concurrently mv_attendance_monthly;
end;
$$ language plpgsql;
