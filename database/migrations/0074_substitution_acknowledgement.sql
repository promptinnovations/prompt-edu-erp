-- =============================================================================
-- PROMPT EDU ERP — Migration 0074: substitution acknowledgement + timetable access
--
-- "A teacher should see their own timetable only ... with the assigned
-- substitution in a highlight colour — the teacher should click on it as a
-- sign, so that the authority can verify all subs are taken."
--
-- staff_substitutions already records who is covering. This adds the sign:
-- when the covering teacher taps the highlighted period, acknowledged_at /
-- acknowledged_by are stamped. confirmSubstitutions() clears the sign again
-- if the covering teacher is changed afterwards (the new teacher has not
-- seen it yet).
--
-- timetable.view_all = see and search EVERY class / teacher timetable and the
-- "substitutions today" verification panel. Everyone else (teachers, staff)
-- sees only their own timetable and the classes they teach.
-- =============================================================================

alter table staff_substitutions
  add column acknowledged_at timestamptz,
  add column acknowledged_by uuid references users(id) on delete set null;

create index idx_staff_substitutions_ack on staff_substitutions(institution_id, date, acknowledged_at);

insert into permissions (code, module, description) values
  ('timetable.view_all', 'substitution', 'See and search every class and teacher timetable, and check that substitutions are acknowledged')
on conflict (code) do nothing;

do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code in ('institution_admin', 'management', 'section_head')
       and p.code = 'timetable.view_all'
    on conflict do nothing;
  end loop;
end $$;
