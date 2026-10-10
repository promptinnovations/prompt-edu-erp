-- =============================================================================
-- PROMPT EDU ERP — Migration 0061: portfolio_summaries.
--
-- §Portfolio-dashboard follow-up ("the student and parent portal should be
-- like this [reference: a rich Student Portfolio dashboard with a
-- Teacher's Overall Remark quote + Strengths / Areas for Improvement /
-- Future Goals checklists]"). The app already has per-session mentoring
-- notes with similar free-text fields (mentoring_records.strengths/
-- challenges/goals — migration 0013), but nothing framed as ONE current,
-- standing summary for a student's portfolio. Per explicit answer to
-- AskUserQuestion ("New dedicated portfolio-summary record"), this is a
-- separate table: one row per student per academic year, set by a class
-- teacher/admin and shown on the portfolio dashboard, independent of the
-- mentoring session log's own cadence.
--
-- Gated behind the existing `student.edit` permission in the app layer
-- (same gate the rest of the Student Portfolio tab's edit actions already
-- use in app/(institution)/students/[id]/page.tsx) — no new permission
-- row needed.
--
-- strengths/areas_for_improvement/future_goals are plain newline-separated
-- `text`, not `text[]` — matching mentoring_records.strengths/challenges/
-- goals (migration 0013), the existing precedent for this exact kind of
-- field in this codebase (no table anywhere else uses an actual text[]
-- column); the service layer still exposes/accepts these as string[] for a
-- clean checklist-editing UI, splitting/joining on '\n' at the boundary.
-- =============================================================================

create table portfolio_summaries (
  id                     uuid primary key default gen_random_uuid(),
  institution_id         uuid not null references institutions(id) on delete cascade,
  student_id             uuid not null references students(id) on delete cascade,
  academic_year_id       uuid not null references academic_years(id) on delete cascade,
  overall_remark         text,
  strengths              text,
  areas_for_improvement  text,
  future_goals           text,
  set_by                 uuid references users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create index idx_portfolio_summaries_student on portfolio_summaries(institution_id, student_id);

alter table portfolio_summaries enable row level security;

create policy tenant_isolation_select on portfolio_summaries for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_insert on portfolio_summaries for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_update on portfolio_summaries for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_delete on portfolio_summaries for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
