-- =============================================================================
-- PROMPT EDU ERP — Migration 0049: Exam Seating Arrangement (Examinations
-- sub-module).
--
-- "Generate exam seating plans + printable bench stickers (student name,
-- class+division, roll number) for a specific examination."
--
-- exam_rooms — the reusable classroom MASTER list an institution sets up
-- once ("Room 12", 15 benches, 2 seats per bench, optionally girls-only)
-- and reuses across every examination. Plain institution-scoped config,
-- same shape as every other *_categories/*_types config table here.
--
-- exam_seating_plans / exam_seating_plan_rooms — one plan per examination
-- (unique below: regenerating REPLACES, so "the seating plan for this exam"
-- is always unambiguous). plan_rooms SNAPSHOTS each room's name/bench
-- count/seats/gender restriction at generation time rather than pointing at
-- exam_rooms for those values, which is what makes two things possible at
-- once: (a) ad-hoc rooms — a hall borrowed for this one exam, never added
-- to the master list (exam_room_id null, is_ad_hoc true), and (b) an
-- already-generated plan that still prints correctly after someone edits or
-- deletes the master room afterwards (exam_room_id is `on delete set null`
-- precisely so the snapshot outlives the master row).
--
-- exam_seating_assignments — student -> room -> bench -> seat. The
-- student's name/class/division/roll/gender are DENORMALIZED here for the
-- same reason: a bench sticker printed next week must still say what it
-- said when the plan was generated, even if the student is re-enrolled into
-- another division or has their roll number recomputed in between. The
-- student_id FK stays (for linking back) but is `on delete set null` — a
-- deleted student must not silently vacuum a seat out of a printed plan.
--
-- institutions.exam_seating_gender_rule — institution-level toggle between
-- 'hard' (never mix boys and girls in one room; generation FAILS with a
-- capacity-shortfall message it cannot satisfy) and 'best_effort' (mix only
-- as a last resort when capacity is tight). A column on `institutions`, not
-- an institution_settings row, following parent_portal_sections' precedent
-- for a setting the Settings page owns and writes through migration 0020's
-- narrow institutions_update_self policy.
--
-- The no-two-students-from-the-same-grade-per-bench rule is NOT a database
-- constraint: it is a property of how modules/examination/seating-allocator
-- .ts fills benches, and a constraint here could only be expressed as an
-- exclusion constraint over a denormalized class_id, which would reject the
-- deliberate best-effort fallbacks the allocator is allowed to make. RLS is
-- the tenant gate; the allocator is the seating gate.
-- =============================================================================

alter table institutions
  add column exam_seating_gender_rule text not null default 'best_effort';

alter table institutions
  add constraint institutions_exam_seating_gender_rule_check
  check (exam_seating_gender_rule in ('hard', 'best_effort'));

create table exam_rooms (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references institutions(id) on delete cascade,
  name                text not null,
  bench_count         integer not null,
  seats_per_bench     integer not null default 2,
  gender_restriction  text,            -- null = open to anyone; 'male' | 'female'
  is_active           boolean not null default true,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (institution_id, name),
  check (bench_count > 0 and bench_count <= 500),
  check (seats_per_bench > 0 and seats_per_bench <= 10),
  check (gender_restriction is null or gender_restriction in ('male', 'female'))
);

create index idx_exam_rooms_institution_active on exam_rooms(institution_id, is_active);

create table exam_seating_plans (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  examination_id   uuid not null references examinations(id) on delete cascade,
  -- Snapshot of institutions.exam_seating_gender_rule as it stood when this
  -- plan was generated — the chart must be able to explain itself later
  -- ("why are there mixed rooms here?") even after the setting is flipped.
  gender_rule      text not null,
  student_count    integer not null default 0,
  seat_count       integer not null default 0,
  mixed_room_count integer not null default 0,
  generated_by     uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (institution_id, examination_id),
  check (gender_rule in ('hard', 'best_effort'))
);

create table exam_seating_plan_rooms (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references institutions(id) on delete cascade,
  plan_id             uuid not null references exam_seating_plans(id) on delete cascade,
  exam_room_id        uuid references exam_rooms(id) on delete set null, -- null once the master row is gone, or for an ad-hoc room
  name                text not null,
  bench_count         integer not null,
  seats_per_bench     integer not null,
  gender_restriction  text,
  is_ad_hoc           boolean not null default false,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  check (bench_count > 0),
  check (seats_per_bench > 0),
  check (gender_restriction is null or gender_restriction in ('male', 'female'))
);

create index idx_exam_seating_plan_rooms_institution_plan on exam_seating_plan_rooms(institution_id, plan_id);

create table exam_seating_assignments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  plan_id           uuid not null references exam_seating_plans(id) on delete cascade,
  plan_room_id      uuid not null references exam_seating_plan_rooms(id) on delete cascade,
  student_id        uuid references students(id) on delete set null,
  class_id          uuid references classes(id) on delete set null,
  bench_number      integer not null,
  seat_number       integer not null,
  -- Denormalized print payload — everything a bench sticker needs.
  student_name      text not null,
  class_name        text not null,
  division_name     text,
  roll_number       integer,
  admission_number  text,
  gender            text,
  created_at        timestamptz not null default now(),
  unique (institution_id, plan_room_id, bench_number, seat_number),
  check (bench_number > 0),
  check (seat_number > 0)
);

create index idx_exam_seating_assignments_institution_plan on exam_seating_assignments(institution_id, plan_id);
create index idx_exam_seating_assignments_institution_student on exam_seating_assignments(institution_id, student_id);

do $$
declare
  t text;
  new_tables text[] := array['exam_rooms', 'exam_seating_plans', 'exam_seating_plan_rooms', 'exam_seating_assignments'];
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

-- Permission catalogue + self-healing per-institution grants (same pattern
-- as migration 0045's fees.* grants — every institution that already exists
-- gets the new permission wired to the right roles immediately, with no
-- per-institution manual step). New institutions get it from
-- database/scripts/seed.ts's role templates instead.
insert into permissions (code, module, description) values
  ('examinations.seating.manage', 'examination', 'Manage exam rooms and generate/print examination seating plans')
on conflict (code) do nothing;

do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code in ('institution_admin', 'management')
       and p.code = 'examinations.seating.manage'
    on conflict do nothing;
  end loop;
end $$;
