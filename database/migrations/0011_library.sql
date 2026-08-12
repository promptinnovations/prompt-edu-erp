-- =============================================================================
-- PROMPT EDU ERP — Migration 0011: Library
-- ARCHITECTURE.md §D.11, §M (Library Architecture), Phase 9 (§AA.2).
--
-- authors/publishers/book_categories/shelves are institution CONFIGURATION
-- (§K/§254) — no publisher/category list is ever a platform-wide enum.
-- books -> book_copies (availability tracked per physical copy, §M.1) ->
-- book_issues/book_returns (transactions) -> reading_records (the
-- student-facing review/approval layer that feeds the portfolio, §M.3).
-- =============================================================================

create table authors (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  created_at       timestamptz not null default now()
);

create table publishers (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  created_at       timestamptz not null default now()
);

create table book_categories (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

create table shelves (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  name             text not null,
  location         text,
  created_at       timestamptz not null default now(),
  unique (institution_id, name)
);

create table books (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references institutions(id) on delete cascade,
  isbn               text,
  title              text not null,
  subtitle           text,
  author_id          uuid references authors(id),
  publisher_id       uuid references publishers(id),
  edition            text,
  language           text,
  category_id        uuid references book_categories(id),
  subject            text,
  shelf_id           uuid references shelves(id),
  acquisition_date   date,
  status             text not null default 'active', -- active|withdrawn
  created_at         timestamptz not null default now(),
  check (status in ('active', 'withdrawn'))
);

create table book_copies (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  book_id          uuid not null references books(id) on delete cascade,
  copy_code        text not null,
  condition        text not null default 'good',
  status           text not null default 'available', -- available|issued|lost|damaged
  created_at       timestamptz not null default now(),
  unique (institution_id, book_id, copy_code),
  check (status in ('available', 'issued', 'lost', 'damaged'))
);

create table book_issues (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  book_copy_id     uuid not null references book_copies(id),
  student_id       uuid not null references students(id) on delete cascade,
  issued_by        uuid,
  issue_date       date not null default current_date,
  due_date         date not null,
  status           text not null default 'issued', -- issued|returned|lost
  created_at       timestamptz not null default now(),
  check (status in ('issued', 'returned', 'lost'))
  -- Note: the master spec's status enum also lists "overdue" — this build
  -- computes overdueness dynamically (due_date < current_date and
  -- status='issued') rather than maintaining it as a stored, cron-updated
  -- status, since no scheduled-job runner exists yet (same tracked
  -- limitation as the analytics/consolidated-score refresh jobs).
);

create table book_returns (
  id                     uuid primary key default gen_random_uuid(),
  institution_id         uuid not null references institutions(id) on delete cascade,
  book_issue_id          uuid not null references book_issues(id) on delete cascade,
  returned_by            uuid,
  return_date            date not null default current_date,
  condition_on_return    text not null default 'good',
  fine_amount            numeric(8,2),
  created_at             timestamptz not null default now()
);

create table reading_records (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  book_id          uuid not null references books(id),
  book_issue_id    uuid not null references book_issues(id),
  review_text      text,
  review_status    text not null default 'not_required', -- not_required|pending|approved|rejected
  approved_by      uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (review_status in ('not_required', 'pending', 'approved', 'rejected'))
);

create index idx_authors_institution on authors(institution_id);
create index idx_publishers_institution on publishers(institution_id);
create index idx_book_categories_institution on book_categories(institution_id);
create index idx_shelves_institution on shelves(institution_id);
create index idx_books_institution on books(institution_id, status);
create index idx_book_copies_book on book_copies(institution_id, book_id, status);
create index idx_book_issues_student on book_issues(institution_id, student_id, status);
create index idx_book_issues_copy on book_issues(institution_id, book_copy_id, status);
create index idx_book_returns_issue on book_returns(institution_id, book_issue_id);
create index idx_reading_records_student on reading_records(institution_id, student_id);
create index idx_reading_records_status on reading_records(institution_id, review_status);

-- RLS — same dual-gate pattern as prior migrations (§E).
do $$
declare
  t text;
  library_tables text[] := array[
    'authors','publishers','book_categories','shelves','books','book_copies',
    'book_issues','book_returns','reading_records'
  ];
begin
  foreach t in array library_tables loop
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
