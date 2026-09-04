-- =============================================================================
-- PROMPT EDU ERP — Migration 0045: Fee module (Phase D §1 "Add a module for
-- FEE - admin will add fee details, category etc. admin or account staff
-- will update payment status - generate paid list, pending etc.").
--
-- fee_categories: institution-defined kinds of fee ("Tuition Fee",
-- "Transport Fee", "Exam Fee") — same lightweight institution-scoped config
-- table pattern as every other *_categories table in this schema (e.g.
-- achievement_categories, migration 0038).
--
-- fee_structures: what a category costs for a given class in a given
-- academic year ("admin will add fee details") — class_id is NULLABLE,
-- meaning "applies to every class" (a single row can define an
-- institution-wide fee like "Admission Fee" without one row per class).
-- This is the thing an admin actually authors; it does not itself owe
-- anything to anyone.
--
-- student_fee_invoices: the actual per-student amount owed, generated from
-- a fee_structure (assignFeeStructureToClass()) OR created ad-hoc for one
-- student (assignAdHocFee()) — always the row "paid list"/"pending list"
-- queries read from. status is maintained by the service layer as payments
-- come in (pending -> partial -> paid), never hand-set to 'paid' directly
-- from a form.
--
-- fee_payments: one row per payment attempt against an invoice. Two
-- statuses: 'confirmed' (recorded directly by admin/account staff, counts
-- immediately) and 'pending_confirmation' (self-reported by a PARENT from
-- the parent portal — "I paid via UPI, reference 123456" — §L.3's
-- established "only approved counts" rule applies here too: a
-- pending_confirmation payment does NOT move the invoice out of
-- pending/partial until account staff confirms it. This project does not
-- integrate a live payment gateway — no gateway credentials were supplied —
-- so "pay fee" from the parent portal is a record-and-confirm workflow
-- matching how most schools already reconcile offline/UPI/bank-transfer fee
-- payments, not a card processor.
--
-- New system role: 'accounts_staff' — the user's own wording ("admin OR
-- account staff will update payment status") names a role distinct from
-- institution_admin. Kept minimal (fees.* + accounts.* only, see migration
-- 0046) rather than reusing the generic 'staff' role, so an institution can
-- grant fee-collection access without also granting whatever 'staff' ends
-- up meaning elsewhere.
-- =============================================================================

create table fee_categories (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  name            text not null,
  description     text,
  created_at      timestamptz not null default now(),
  unique (institution_id, name)
);

create table fee_structures (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  fee_category_id    uuid not null references fee_categories(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id) on delete cascade,
  class_id           uuid references classes(id) on delete cascade, -- null = every class
  amount             numeric(12,2) not null,
  due_date           date,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  check (amount >= 0)
);

create index idx_fee_structures_institution_year on fee_structures(institution_id, academic_year_id);

create table student_fee_invoices (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  fee_structure_id   uuid references fee_structures(id) on delete set null,
  fee_category_id    uuid not null references fee_categories(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id) on delete cascade,
  amount_due         numeric(12,2) not null,
  due_date           date,
  status             text not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (amount_due >= 0),
  check (status in ('pending', 'partial', 'paid', 'waived'))
);

create index idx_student_fee_invoices_institution_student on student_fee_invoices(institution_id, student_id);
create index idx_student_fee_invoices_institution_status on student_fee_invoices(institution_id, status);

create table fee_payments (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  invoice_id       uuid not null references student_fee_invoices(id) on delete cascade,
  amount           numeric(12,2) not null,
  payment_date     date not null default current_date,
  payment_method   text not null default 'cash',
  reference_no     text,
  notes            text,
  status           text not null default 'confirmed',
  recorded_by      uuid references users(id), -- admin/account staff who recorded it, or the paying parent (self-reported)
  confirmed_by     uuid references users(id),
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  check (amount > 0),
  check (status in ('confirmed', 'pending_confirmation', 'rejected')),
  check (payment_method in ('cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'))
);

create index idx_fee_payments_institution_invoice on fee_payments(institution_id, invoice_id);
create index idx_fee_payments_institution_status on fee_payments(institution_id, status);

do $$
declare
  t text;
  new_tables text[] := array['fee_categories', 'fee_structures', 'student_fee_invoices', 'fee_payments'];
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

-- Platform module + permission catalogue.
insert into modules (code, name, description, category, is_core, is_active) values
  ('fees', 'Fee Management', 'Fee categories, structures, invoices, and payment tracking', 'finance', false, true)
on conflict (code) do nothing;

insert into permissions (code, module, description) values
  ('fees.manage',   'fees', 'Manage fee categories and structures'),
  ('fees.collect',  'fees', 'Record and confirm fee payments'),
  ('fees.view',     'fees', 'View fee invoices, paid/pending lists'),
  ('fees.pay_own',  'fees', 'Submit a fee payment for own child (parent, pending confirmation)')
on conflict (code) do nothing;

-- Self-healing per-institution backfill (same pattern as migration 0034):
-- create the accounts_staff role + grant institution_admin/management/
-- accounts_staff/parent the relevant new permissions on every institution
-- that already exists, so production institutions get this module usable
-- immediately once the migration runs (no per-institution manual step).
do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into roles (institution_id, code, name, is_system_role)
    values (inst.id, 'accounts_staff', 'Accounts Staff', true)
    on conflict (institution_id, code) do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'institution_admin'
       and p.code in ('fees.manage', 'fees.collect', 'fees.view')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'accounts_staff'
       and p.code in ('fees.manage', 'fees.collect', 'fees.view')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'management'
       and p.code = 'fees.view'
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'parent'
       and p.code = 'fees.pay_own'
    on conflict do nothing;
  end loop;
end $$;
