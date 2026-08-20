-- =============================================================================
-- PROMPT EDU ERP — Migration 0033: Library pre-booking + review reactions
-- §Page-8 follow-up ("Pre book — a book which has already been issued,
-- another child can pre book it, once returned notification for the one
-- booked will be delivered" / "Review Corner — each children can give
-- like or dislike impression for review").
--
-- book_holds: a waitlist entry against a BOOK (not a specific copy — any
-- copy becoming available satisfies the hold), one row per
-- (student, book, "active" attempt). Deliberately no DB-level unique
-- constraint on (book_id, student_id) — a student who cancels a hold and
-- later wants to hold the same book again is a normal, legitimate flow,
-- so "only one ACTIVE hold per student per book" is enforced in
-- application code (placeHold()) exactly like every other business-rule
-- guard in this codebase (§K/§L convention: DB constraints for structural
-- invariants, service-layer checks for business rules).
--
-- review_reactions: one like/dislike per (reading_records row, student) —
-- THIS one IS a structural invariant (a student cannot both like and
-- dislike the same review at once), so it gets a real unique constraint;
-- toggling/switching a reaction is an update or delete, never a second row.
-- =============================================================================

create table book_holds (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  book_id          uuid not null references books(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  status           text not null default 'pending', -- pending|notified|fulfilled|cancelled
  requested_at     timestamptz not null default now(),
  notified_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (status in ('pending', 'notified', 'fulfilled', 'cancelled'))
);

create table review_reactions (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  reading_record_id  uuid not null references reading_records(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  reaction           text not null, -- like|dislike
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (institution_id, reading_record_id, student_id),
  check (reaction in ('like', 'dislike'))
);

create index idx_book_holds_book_status on book_holds(institution_id, book_id, status, requested_at);
create index idx_book_holds_student on book_holds(institution_id, student_id, status);
create index idx_review_reactions_record on review_reactions(institution_id, reading_record_id);

-- RLS — same dual-gate pattern as every prior migration (§E).
do $$
declare
  t text;
  new_tables text[] := array['book_holds', 'review_reactions'];
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
