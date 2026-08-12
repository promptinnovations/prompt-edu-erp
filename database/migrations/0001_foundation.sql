-- =============================================================================
-- PROMPT EDU ERP — Migration 0001: Foundation
-- Scope: institutions, identity/roles/permissions, academic structure, students
-- Matches ARCHITECTURE.md §D (Complete Table Structure) and §E (Institution
-- Isolation Strategy). Every tenant-owned table gets institution_id + RLS.
-- Portable standard PostgreSQL (no Supabase-specific extensions used).
-- =============================================================================

-- gen_random_uuid() is built into PostgreSQL core since v13 — no extension
-- needed (kept extension-free deliberately for maximum portability across
-- Supabase / Neon / self-hosted / PGlite, per §V).

-- -----------------------------------------------------------------------------
-- Helper: standard audit columns are added per-table (created_at, updated_at,
-- created_by, updated_by) rather than via inheritance, to keep RLS simple and
-- portable across providers (§D).
-- -----------------------------------------------------------------------------

-- =============================================================================
-- PLATFORM (not institution-scoped — no institution_id, no per-row RLS by
-- institution; access controlled entirely via application-layer Super Admin
-- permission checks, per §B.4)
-- =============================================================================

create table subscription_plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  max_students      integer,
  max_staff         integer,
  max_users         integer,
  max_storage_mb    integer,
  max_modules       integer,
  features_jsonb    jsonb not null default '{}'::jsonb,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table institutions (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,           -- short slug, e.g. "badrudhuja"
  name              text not null,
  legal_name        text,
  type              text not null default 'other',  -- madrasa|islamic_school|school|college|dars|other
  status            text not null default 'active', -- active|inactive|suspended|trial
  deployment_mode   text not null default 'shared',  -- shared|dedicated
  plan_id           uuid references subscription_plans(id),
  timezone          text not null default 'Asia/Kolkata',
  default_locale    text not null default 'en',      -- v1: 'en' or 'ml' — see §S
  logo_file_id      uuid,
  favicon_file_id   uuid,
  primary_color     text,
  secondary_color   text,
  app_name          text,
  short_name        text,
  welcome_message   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table institution_settings (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  key               text not null,
  value_jsonb       jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (institution_id, key)
);

create table modules (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,   -- "academic", "library", "reading", …
  name              text not null,
  description       text,
  category          text,
  is_core           boolean not null default false,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create table institution_modules (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references institutions(id) on delete cascade,
  module_id         uuid not null references modules(id) on delete cascade,
  is_enabled        boolean not null default true,
  enabled_at        timestamptz not null default now(),
  enabled_by        uuid,
  unique (institution_id, module_id)
);

create table module_configs (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  module_id          uuid not null references modules(id) on delete cascade,
  config_key         text not null,
  config_value_jsonb jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (institution_id, module_id, config_key)
);

create table platform_audit_logs (
  id               uuid primary key default gen_random_uuid(),
  actor_user_id    uuid,
  institution_id   uuid references institutions(id),
  action           text not null,
  entity_type      text not null,
  entity_id        uuid,
  before_jsonb     jsonb,
  after_jsonb      jsonb,
  ip_address       text,
  user_agent       text,
  created_at       timestamptz not null default now()
);

create table usage_metrics (
  id                       uuid primary key default gen_random_uuid(),
  institution_id           uuid not null references institutions(id) on delete cascade,
  period_start             date not null,
  period_end               date not null,
  student_count            integer not null default 0,
  staff_count              integer not null default 0,
  parent_count             integer not null default 0,
  user_count               integer not null default 0,
  storage_bytes            bigint not null default 0,
  file_count               integer not null default 0,
  record_count             integer not null default 0,
  active_user_count        integer not null default 0,
  api_request_count        integer not null default 0,
  imports_count            integer not null default 0,
  exports_count            integer not null default 0,
  reports_generated_count  integer not null default 0,
  created_at               timestamptz not null default now(),
  unique (institution_id, period_start, period_end)
);

-- =============================================================================
-- IDENTITY, ROLES, PERMISSIONS
-- =============================================================================

create table users (
  id                 uuid primary key default gen_random_uuid(),
  auth_user_id       uuid unique,           -- Supabase Auth user id (or equivalent)
  email              text unique,
  phone              text,
  full_name          text not null,
  preferred_locale   text default 'en',
  status             text not null default 'active',
  last_login_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table user_institution_memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  institution_id   uuid not null references institutions(id) on delete cascade,
  status           text not null default 'active',
  is_primary       boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (user_id, institution_id)
);

-- roles.institution_id is nullable = platform-level role (e.g. super_admin);
-- otherwise scoped to one institution (system-seeded or custom, §23/§F)
create table roles (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid references institutions(id) on delete cascade,
  code              text not null,
  name              text not null,
  is_system_role    boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (institution_id, code)
);

create table permissions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,   -- "student.view", "marks.enter", …
  module        text not null,
  description   text
);

create table role_permissions (
  id              uuid primary key default gen_random_uuid(),
  role_id         uuid not null references roles(id) on delete cascade,
  permission_id   uuid not null references permissions(id) on delete cascade,
  unique (role_id, permission_id)
);

create table user_roles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  institution_id   uuid not null references institutions(id) on delete cascade,
  role_id          uuid not null references roles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (user_id, institution_id, role_id)
);

create table audit_logs (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  user_id          uuid,
  action           text not null,
  module           text,
  entity_type      text not null,
  entity_id        uuid,
  before_jsonb     jsonb,
  after_jsonb      jsonb,
  ip_address       text,
  user_agent       text,
  created_at       timestamptz not null default now()
);

-- =============================================================================
-- ACADEMIC STRUCTURE (§D.3)
-- =============================================================================

create table academic_years (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,        -- e.g. "2026-2027"
  start_date       date not null,
  end_date         date not null,
  is_current       boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

create table terms (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id) on delete cascade,
  name               text not null,
  start_date         date not null,
  end_date           date not null
);

create table classes (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  name               text not null,
  sort_order         integer not null default 0,
  academic_stream    text,
  created_at         timestamptz not null default now(),
  unique (institution_id, name)
);

create table sections (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  class_id         uuid not null references classes(id) on delete cascade,
  name             text not null,
  capacity         integer,
  unique (institution_id, class_id, name)
);

create table subjects (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  code             text,
  name             text not null,
  category         text,
  unique (institution_id, name)
);

create table class_subjects (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  class_id         uuid not null references classes(id) on delete cascade,
  subject_id       uuid not null references subjects(id) on delete cascade,
  is_core          boolean not null default true,
  unique (institution_id, class_id, subject_id)
);

create table teacher_assignments (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  class_id           uuid references classes(id) on delete cascade,
  section_id         uuid references sections(id) on delete cascade,
  subject_id         uuid references subjects(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id) on delete cascade,
  role_type          text not null default 'subject_teacher' -- class_teacher|subject_teacher
);

-- =============================================================================
-- PEOPLE — students (§D.4)
-- =============================================================================

create table students (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  admission_number   text not null,
  full_name          text not null,      -- Unicode-safe, any of the six languages (§S.3)
  full_name_native   text,
  photo_file_id      uuid,
  date_of_birth      date,
  gender             text,
  contact_phone      text,
  contact_email      text,
  address            text,
  status             text not null default 'active', -- active|transferred|withdrawn|graduated
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid,
  unique (institution_id, admission_number)
);

create table student_enrollments (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id) on delete cascade,
  class_id           uuid not null references classes(id) on delete cascade,
  section_id         uuid not null references sections(id) on delete cascade,
  enrollment_date    date not null default current_date,
  status             text not null default 'active',
  exit_date          date,
  exit_reason        text
);

create table parents (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  full_name        text not null,
  phone            text,
  email            text,
  occupation       text
);

create table student_parents (
  id                    uuid primary key default gen_random_uuid(),
  institution_id        uuid not null references institutions(id) on delete cascade,
  student_id            uuid not null references students(id) on delete cascade,
  parent_id             uuid not null references parents(id) on delete cascade,
  relationship          text,
  is_primary_contact    boolean not null default false,
  unique (institution_id, student_id, parent_id)
);

create table staff (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid not null references institutions(id) on delete cascade,
  user_id              uuid not null references users(id) on delete cascade,
  staff_code           text,
  designation          text,
  department           text,
  joining_date         date,
  employment_status    text not null default 'active',
  unique (institution_id, user_id)
);

-- =============================================================================
-- INDEXES (§D.14)
-- =============================================================================

create index idx_inst_settings_institution on institution_settings(institution_id);
create index idx_inst_modules_institution on institution_modules(institution_id);
create index idx_module_configs_institution on module_configs(institution_id);
create index idx_usage_metrics_institution on usage_metrics(institution_id);
create index idx_memberships_user on user_institution_memberships(user_id);
create index idx_memberships_institution on user_institution_memberships(institution_id);
create index idx_roles_institution on roles(institution_id);
create index idx_user_roles_lookup on user_roles(user_id, institution_id);
create index idx_audit_logs_institution on audit_logs(institution_id, created_at desc);
create index idx_academic_years_institution on academic_years(institution_id);
create index idx_terms_institution on terms(institution_id, academic_year_id);
create index idx_classes_institution on classes(institution_id);
create index idx_sections_institution on sections(institution_id, class_id);
create index idx_subjects_institution on subjects(institution_id);
create index idx_class_subjects_institution on class_subjects(institution_id, class_id);
create index idx_teacher_assignments_institution on teacher_assignments(institution_id, academic_year_id);
create index idx_students_institution on students(institution_id, status);
create index idx_students_name on students(institution_id, full_name);
create index idx_enrollments_institution on student_enrollments(institution_id, academic_year_id, class_id, section_id);
create index idx_enrollments_student on student_enrollments(student_id);
create index idx_parents_institution on parents(institution_id);
create index idx_student_parents_institution on student_parents(institution_id, student_id);
create index idx_staff_institution on staff(institution_id);

-- =============================================================================
-- ROW LEVEL SECURITY (§E) — enabled on every institution-owned table.
-- Pattern: institution_id = current_setting('app.current_institution_id')::uuid
-- Set server-side per request/transaction — never from client input (§E.1/§E.2).
-- A Postgres role "app_super_admin" bypasses via a separate explicit policy
-- for platform-level operations (§B.4) rather than disabling RLS globally.
-- =============================================================================

do $$
declare
  t text;
  tenant_tables text[] := array[
    'institution_settings','institution_modules','module_configs','usage_metrics',
    'user_institution_memberships','roles','user_roles','audit_logs',
    'academic_years','terms','classes','sections','subjects','class_subjects',
    'teacher_assignments','students','student_enrollments','parents',
    'student_parents','staff'
  ];
begin
  foreach t in array tenant_tables loop
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

-- `institutions` itself: readable by members of that institution or Super Admin;
-- writable only by Super Admin (application-layer enforced) — a permissive
-- select policy plus a restrictive write policy, since it has no institution_id
-- column of its own (it IS the tenant).
alter table institutions enable row level security;

create policy institutions_select on institutions for select
  using (
    id = nullif(current_setting('app.current_institution_id', true), '')::uuid
    or current_setting('app.is_super_admin', true) = 'true'
  );

create policy institutions_write on institutions for all
  using (current_setting('app.is_super_admin', true) = 'true')
  with check (current_setting('app.is_super_admin', true) = 'true');

-- platform-level tables (modules catalogue, subscription_plans) are readable
-- by everyone (needed to render module library / plan info) but writable only
-- by Super Admin.
alter table modules enable row level security;
create policy modules_select on modules for select using (true);
create policy modules_write on modules for all
  using (current_setting('app.is_super_admin', true) = 'true')
  with check (current_setting('app.is_super_admin', true) = 'true');

alter table subscription_plans enable row level security;
create policy plans_select on subscription_plans for select using (true);
create policy plans_write on subscription_plans for all
  using (current_setting('app.is_super_admin', true) = 'true')
  with check (current_setting('app.is_super_admin', true) = 'true');

alter table platform_audit_logs enable row level security;
create policy platform_audit_select on platform_audit_logs for select
  using (current_setting('app.is_super_admin', true) = 'true');
create policy platform_audit_insert on platform_audit_logs for insert
  with check (true); -- application layer always writes these itself

-- `users` is intentionally NOT institution-scoped (a user can belong to many
-- institutions via user_institution_memberships) — visibility of a user's
-- profile to other institution members is enforced at the application/service
-- layer (via membership + role checks), not via a single-institution RLS
-- predicate, since users.institution_id does not exist by design (§D.2/§B.3).
alter table users enable row level security;
create policy users_select_self on users for select
  using (auth_user_id = nullif(current_setting('app.current_auth_user_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true'
         or current_setting('app.can_view_all_users', true) = 'true');
create policy users_write_self on users for update
  using (auth_user_id = nullif(current_setting('app.current_auth_user_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
create policy users_insert on users for insert with check (true); -- service-layer gated

alter table permissions enable row level security;
create policy permissions_select on permissions for select using (true);
create policy permissions_write on permissions for all
  using (current_setting('app.is_super_admin', true) = 'true')
  with check (current_setting('app.is_super_admin', true) = 'true');

alter table role_permissions enable row level security;
create policy role_permissions_select on role_permissions for select using (true);
create policy role_permissions_write on role_permissions for all
  using (current_setting('app.is_super_admin', true) = 'true'
         or current_setting('app.can_manage_roles', true) = 'true')
  with check (current_setting('app.is_super_admin', true) = 'true'
              or current_setting('app.can_manage_roles', true) = 'true');
