-- =============================================================================
-- PROMPT EDU ERP — Migration 0046: Accounts module (Phase D §2 "Add an
-- accounts module where income and expense, debit credit, purchase
-- everything will be calculated - connected to fee module if it is
-- active").
--
-- account_categories: institution-defined income/expense categories
-- ("Fee Collection", "Donation" (income); "Salary", "Stationery Purchase",
-- "Maintenance" (expense)) — same lightweight config-table pattern as
-- fee_categories (migration 0045).
--
-- account_transactions: a single general ledger of every income/expense
-- entry, "debit credit" and "purchase" all represented the same way rather
-- than as separate tables: a purchase IS an expense transaction (with
-- optional vendor_name/item_description filled in), and "debit/credit" is
-- just this schema's type='expense'/type='income' distinction under
-- different names — introducing a second, fuller double-entry ledger
-- schema (debit/credit account pairs) would be well out of proportion to
-- what was actually asked for (§K). source_module/source_entity_id let a
-- transaction point back at the record that generated it (e.g. a
-- fee_payments row) without a hard foreign key into every possible source
-- table.
--
-- Auto-posting from Fee module: modules/fees/service.ts's
-- recordFeePayment(), when a payment is confirmed, checks whether the
-- 'accounts' module is enabled for the institution and — if so — inserts a
-- matching account_transactions row (type='income', category = an
-- auto-vivified "Fee Collection" category, source_module='fees',
-- source_entity_id=the fee_payments.id) so the two modules "connect" the
-- way the request describes, without the Fee module hard-depending on
-- Accounts (it works standalone, and stays connected only when Accounts is
-- actually active — checked via services/modules/module-service.ts's
-- existing isModuleActive()/listInstitutionModuleStatus() default-enabled
-- semantics).
-- =============================================================================

create table account_categories (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  name            text not null,
  type            text not null,
  created_at      timestamptz not null default now(),
  unique (institution_id, name),
  check (type in ('income', 'expense'))
);

create table account_transactions (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  category_id        uuid not null references account_categories(id) on delete cascade,
  type               text not null,
  amount             numeric(12,2) not null,
  transaction_date   date not null default current_date,
  description        text,
  vendor_name        text,   -- purchases: who it was bought from
  item_description   text,   -- purchases: what was bought
  payment_method     text not null default 'cash',
  reference_no       text,
  source_module      text,   -- e.g. 'fees' when auto-posted
  source_entity_id   uuid,   -- e.g. the fee_payments.id that generated this row
  recorded_by        uuid references users(id),
  created_at         timestamptz not null default now(),
  check (amount > 0),
  check (type in ('income', 'expense')),
  check (payment_method in ('cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'))
);

create index idx_account_transactions_institution_date on account_transactions(institution_id, transaction_date);
create index idx_account_transactions_institution_type on account_transactions(institution_id, type);
create index idx_account_transactions_source on account_transactions(institution_id, source_module, source_entity_id);

do $$
declare
  t text;
  new_tables text[] := array['account_categories', 'account_transactions'];
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

insert into modules (code, name, description, category, is_core, is_active) values
  ('accounts', 'Accounts', 'Income, expense, purchases and general ledger', 'finance', false, true)
on conflict (code) do nothing;

insert into permissions (code, module, description) values
  ('accounts.manage', 'accounts', 'Manage account categories and record transactions'),
  ('accounts.view',   'accounts', 'View the ledger and financial summaries')
on conflict (code) do nothing;

do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'institution_admin'
       and p.code in ('accounts.manage', 'accounts.view')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'accounts_staff'
       and p.code in ('accounts.manage', 'accounts.view')
    on conflict do nothing;

    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'management'
       and p.code = 'accounts.view'
    on conflict do nothing;
  end loop;
end $$;
