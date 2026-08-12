-- =============================================================================
-- PROMPT EDU ERP — Migration 0007: Analytics foundation
-- ARCHITECTURE.md §N (Analytics Architecture), Phase 5 (§AA.2).
--
-- classification_rules is institution CONFIGURATION (§K/§30 "no threshold is
-- ever hard-coded") — high/low achiever cut-offs are rows, not constants in
-- application code.
--
-- mv_exam_subject_stats / mv_attendance_monthly are the "aggregation layer"
-- of §N.1 — dashboards read from these, never from raw marks/attendance_records
-- directly, so a class-average query does not rescan every mark row on every
-- page load.
--
-- IMPORTANT RLS NOTE (deviation from the dual-gate pattern in §E, tracked
-- here rather than glossed over): PostgreSQL does not support row-level
-- security policies on materialized views. The two views below therefore
-- have NO RLS — Gate 2 (database-enforced isolation) does not exist for
-- this layer. AnalyticsService (modules/analytics/service.ts) is the ONLY
-- sanctioned way to read them, and every one of its exported functions
-- takes an explicit institutionId and hard-filters on it (Gate 1 only,
-- exactly like every other module service, but here it is the sole gate,
-- not a backstop). Nothing outside AnalyticsService may query these views
-- directly. See docs/SETUP.md "Known follow-ups" for the tracked upgrade
-- path (row-level-secured views wrapping these, or per-institution
-- partitioned views) before this pattern is extended further.
-- =============================================================================

create table classification_rules (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  based_on         text not null, -- percentage|average|grade|consolidated_score
  high_threshold   numeric(6,2) not null,
  low_threshold    numeric(6,2) not null,
  created_at       timestamptz not null default now(),
  unique (institution_id, based_on),
  check (based_on in ('percentage', 'average', 'grade', 'consolidated_score')),
  check (high_threshold >= low_threshold)
);

create index idx_classification_rules_institution on classification_rules(institution_id);

alter table classification_rules enable row level security;

create policy tenant_isolation_select on classification_rules for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_insert on classification_rules for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_update on classification_rules for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_delete on classification_rules for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

-- §N.3 mv_exam_subject_stats — per examination/subject/class/section rollup.
create materialized view mv_exam_subject_stats as
select
  es.institution_id,
  es.examination_id,
  es.subject_id,
  ec.class_id,
  ec.section_id,
  count(m.id) filter (where m.entry_status in ('approved', 'locked') and not m.is_absent) as marked_count,
  avg(m.marks_obtained) filter (where m.entry_status in ('approved', 'locked') and not m.is_absent) as avg_marks,
  count(*) filter (where m.entry_status in ('approved', 'locked') and not m.is_absent and m.marks_obtained >= es.pass_marks) as pass_count,
  stddev_pop(m.marks_obtained) filter (where m.entry_status in ('approved', 'locked') and not m.is_absent) as spread
from exam_subjects es
join exam_classes ec on ec.examination_id = es.examination_id
left join marks m on m.exam_subject_id = es.id
group by es.institution_id, es.examination_id, es.subject_id, ec.class_id, ec.section_id;

create index idx_mv_exam_subject_stats_institution on mv_exam_subject_stats(institution_id, examination_id);

-- §N.3 mv_attendance_monthly — per student/class/section/month rollup.
create materialized view mv_attendance_monthly as
select
  ar.institution_id,
  ar.student_id,
  ar.class_id,
  ar.section_id,
  date_trunc('month', ar.date)::date as month,
  count(*) filter (where st.counts_as_present) as present_days,
  count(*) filter (where ar.is_late) as late_days,
  count(*) as total_days
from attendance_records ar
join attendance_statuses st on st.id = ar.status_id
group by ar.institution_id, ar.student_id, ar.class_id, ar.section_id, date_trunc('month', ar.date);

create index idx_mv_attendance_monthly_institution on mv_attendance_monthly(institution_id, student_id, month);

-- Manual refresh (no CONCURRENTLY — that requires a unique index and a
-- scheduled-job runner neither of which exist yet at this phase; tracked in
-- docs/SETUP.md as a pre-scale follow-up). Callable by AnalyticsService.
create or replace function refresh_analytics_views() returns void as $$
begin
  refresh materialized view mv_exam_subject_stats;
  refresh materialized view mv_attendance_monthly;
end;
$$ language plpgsql;
