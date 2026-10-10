-- =============================================================================
-- PROMPT EDU ERP — Migration 0062: live mv_exam_subject_stats
--
-- Bug fix: mv_exam_subject_stats (migration 0007) was created back when
-- marks went through a draft -> submitted -> verified -> approved -> locked
-- workflow, and only counted a mark "marked" once it reached
-- entry_status in ('approved', 'locked').
--
-- Migration 0054 ("live result analysis") moved the rest of the app to a
-- live model: marks are visible from the moment they're entered (still
-- entry_status = 'draft' — that workflow's later states are no longer
-- reachable from the UI, see modules/examination/service.ts's own "Mark
-- workflow (superseded)" comment), and computeResults()/the student-level
-- `results` table were updated to match. This materialized view was
-- missed, so the whole Analytics / Result Analysis section (Examination
-- performance, Subject/Class/Section/Grade/Teacher-wise breakdowns) has
-- been reading zero marked/avg/pass stats for every examination entered
-- since that change — not because no marks exist, but because none of
-- them are 'approved' or 'locked' under the current workflow.
--
-- Fix: count/average/stddev any mark row that has marks_obtained recorded
-- and isn't marked absent, regardless of entry_status — the same
-- "a row in marks at all counts as entered" rule the rest of the app now
-- uses. PostgreSQL has no CREATE OR REPLACE MATERIALIZED VIEW, so this
-- drops and recreates it; CREATE MATERIALIZED VIEW populates immediately
-- (no WITH NO DATA), so this also retroactively backfills stats for every
-- exam already entered under the live-marks workflow without needing a
-- separate manual refresh.
-- =============================================================================

drop materialized view if exists mv_exam_subject_stats;

create materialized view mv_exam_subject_stats as
select
  es.institution_id,
  es.examination_id,
  es.subject_id,
  ec.class_id,
  ec.section_id,
  count(m.id) filter (where m.marks_obtained is not null and not m.is_absent) as marked_count,
  avg(m.marks_obtained) filter (where m.marks_obtained is not null and not m.is_absent) as avg_marks,
  count(*) filter (where m.marks_obtained is not null and not m.is_absent and m.marks_obtained >= es.pass_marks) as pass_count,
  stddev_pop(m.marks_obtained) filter (where m.marks_obtained is not null and not m.is_absent) as spread
from exam_subjects es
join exam_classes ec on ec.examination_id = es.examination_id
left join marks m on m.exam_subject_id = es.id
group by es.institution_id, es.examination_id, es.subject_id, ec.class_id, ec.section_id;

create index idx_mv_exam_subject_stats_institution on mv_exam_subject_stats(institution_id, examination_id);
