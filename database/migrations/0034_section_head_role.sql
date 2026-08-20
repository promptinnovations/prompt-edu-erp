-- =============================================================================
-- PROMPT EDU ERP — Migration 0034: "Section Head" role + stage-scoped
-- attendance visibility (§Attendance-follow-up-3 "Daily overview must be
-- visible according to roles — class for teacher, section wise for section
-- heads, institution wide - Principal, management").
--
-- Per the user's own clarification, "section" here is the school STAGE
-- grouping already introduced in migration 0032 (classes.stage — free text
-- per institution, but standardized going forward as KG/LP/UP/HS/HSS), NOT
-- the A/B/C class subdivision (which is being relabeled "Division" in the
-- UI this same follow-up — see docs/SETUP.md; classes/sections table names
-- and columns are unchanged, this is a display-label change only).
--
-- section_head_assignments: which stage(s) a given user is responsible for
-- overseeing. Deliberately keyed on users.id (not staff.id) to match
-- teacher_assignments' own convention (services/scope/teacher-scope-
-- service.ts reads teacher_assignments.user_id) — a Section Head's identity
-- for scoping purposes is their login/user row, consistent with every other
-- scope helper in this codebase. A user can be head of more than one stage
-- (e.g. a small institution's one administrator covering both HS and HSS),
-- hence a join table rather than a single column on users/staff.
--
-- attendance.view_section: new permission, granted only to the new
-- section_head system role — deliberately distinct from attendance.view
-- (broad "some attendance access", already held by teacher/management) so
-- the stage-wide Daily overview/trend can be gated specifically on "this
-- person oversees a stage", not merely "this person can see attendance at
-- all". See modules/attendance/service.ts's getStaffSectionScope().
--
-- Self-healing backfill: unlike earlier permission additions in this
-- project's history (§Attendance-follow-up doc, "backfilled directly in
-- production by hand"), this migration loops over every EXISTING
-- institution and grants the new role + permission itself — the next time
-- `npm run db:migrate` runs against any environment (including production),
-- every institution (old or new) ends up with a usable, empty (nobody
-- assigned yet) Section Head role, no separate manual SQL required.
-- =============================================================================

create table section_head_assignments (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  stage            text not null,
  created_at       timestamptz not null default now(),
  unique (institution_id, user_id, stage)
);

create index idx_section_head_assignments_institution on section_head_assignments(institution_id, stage);
create index idx_section_head_assignments_user on section_head_assignments(institution_id, user_id);

alter table section_head_assignments enable row level security;

create policy tenant_isolation_select on section_head_assignments for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_insert on section_head_assignments for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_update on section_head_assignments for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_delete on section_head_assignments for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

-- Platform permission catalogue (institution_id = null, same table every
-- other permission lives in — see database/seeds/0001_permissions_and_roles.sql,
-- kept in sync with this insert so fresh `npm run db:seed` runs stay
-- consistent with what production actually has after this migration).
insert into permissions (code, module, description) values
  ('attendance.view_section', 'attendance', 'View the stage-wide attendance overview/trend for own assigned section(s) (Section Head)')
on conflict (code) do nothing;

-- Self-healing per-institution backfill (see header comment).
do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into roles (institution_id, code, name, is_system_role)
    values (inst.id, 'section_head', 'Section Head', true)
    on conflict (institution_id, code) do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'section_head'
       and p.code in ('attendance.view', 'attendance.view_section', 'student.view')
    on conflict do nothing;
  end loop;
end $$;
