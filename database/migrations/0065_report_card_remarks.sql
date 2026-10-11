-- =============================================================================
-- PROMPT EDU ERP — Migration 0065: report_card_remarks.
--
-- §Report-card-remark ("class teacher should have an option for typing
-- report card remark"). One free-text remark per student per examination,
-- written by the student's class teacher (or an admin) and printed in the
-- "Class teacher's remarks" box of that examination's report card.
--
-- Per examination, not per year: a Term 1 card and a Term 2 card each carry
-- their own remark, and a Daily Assessment register (itself an examination
-- row) gets its own monthly remark the same way. portfolio_summaries
-- (migration 0061) stays the year-level standing remark; this does not
-- replace it.
--
-- Who may write is enforced in the app layer (modules/report-card-remarks/
-- service.ts): admins (marks.approve / settings.manage / super admin) for
-- any student, otherwise only a class_teacher assignment covering the
-- student's class and division in the current academic year.
-- =============================================================================

create table report_card_remarks (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  examination_id   uuid not null references examinations(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  remark           text not null check (char_length(remark) between 1 and 1000),
  set_by           uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (examination_id, student_id)
);

create index idx_report_card_remarks_exam on report_card_remarks(institution_id, examination_id);

alter table report_card_remarks enable row level security;

create policy tenant_isolation_select on report_card_remarks for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_insert on report_card_remarks for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_update on report_card_remarks for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_delete on report_card_remarks for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
