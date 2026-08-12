-- =============================================================================
-- PROMPT EDU ERP — Migration 0006: Attendance module
-- ARCHITECTURE.md §D.6 (Attendance & leave) / Phase 4 (§AA.2).
--
-- attendance_statuses is institution-defined CONFIGURATION (§K "no
-- institutional value is ever a literal in application code") — every
-- institution can define its own set (Present/Absent/Late/Half-day/On-leave,
-- or something else entirely). The one non-negotiable rule (§36) is that
-- exactly one status per institution is flagged is_default=true so the app
-- always has a sane fallback to offer in the marking UI; nothing is ever
-- silently assumed present.
-- =============================================================================

create table attendance_statuses (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  code              text not null,
  label             text not null,
  counts_as_present boolean not null default true,
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (institution_id, code)
);

create table attendance_records (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  class_id         uuid not null references classes(id),
  section_id       uuid references sections(id),
  date             date not null,
  status_id        uuid not null references attendance_statuses(id),
  is_late          boolean not null default false,
  late_minutes     integer,
  marked_by        uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (institution_id, student_id, date)
);

create table leave_applications (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  applicant_type   text not null, -- student|staff
  applicant_id     uuid not null,
  start_date       date not null,
  end_date         date not null,
  reason           text,
  status           text not null default 'pending', -- pending|approved|rejected
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (applicant_type in ('student', 'staff')),
  check (status in ('pending', 'approved', 'rejected')),
  check (end_date >= start_date)
);

create table staff_attendance (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  staff_id         uuid not null,
  date             date not null,
  period           text,
  status_id        uuid not null references attendance_statuses(id),
  marked_by        uuid,
  created_at       timestamptz not null default now(),
  unique (institution_id, staff_id, date, period)
);

create table staff_leave (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  staff_id         uuid not null,
  start_date       date not null,
  end_date         date not null,
  reason           text,
  status           text not null default 'pending',
  reviewed_by      uuid,
  created_at       timestamptz not null default now(),
  check (status in ('pending', 'approved', 'rejected')),
  check (end_date >= start_date)
);

-- Indexes matching the analytics query patterns in §N (attendance_records is
-- a high-volume table — §550).
create index idx_attendance_statuses_institution on attendance_statuses(institution_id);
create index idx_attendance_records_institution on attendance_records(institution_id, date);
create index idx_attendance_records_student on attendance_records(institution_id, student_id, date);
create index idx_attendance_records_class on attendance_records(institution_id, class_id, section_id, date);
create index idx_leave_applications_institution on leave_applications(institution_id, applicant_type, applicant_id);
create index idx_leave_applications_status on leave_applications(institution_id, status);
create index idx_staff_attendance_institution on staff_attendance(institution_id, date);
create index idx_staff_leave_institution on staff_leave(institution_id, staff_id);

-- RLS — same dual-gate pattern as 0001/0005 (§E).
do $$
declare
  t text;
  attendance_tables text[] := array[
    'attendance_statuses','attendance_records','leave_applications',
    'staff_attendance','staff_leave'
  ];
begin
  foreach t in array attendance_tables loop
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
