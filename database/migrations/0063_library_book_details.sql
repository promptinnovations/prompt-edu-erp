-- =============================================================================
-- PROMPT EDU ERP — Migration 0063: book detail fields for the student-portal
-- book page.
--
-- §Library-workflow ("when pressed on the book, its details like author,
-- year of publishing, original language, genre everything will appear").
-- `books` (migration 0011) already carries author, publisher, edition,
-- language, category (= genre), subject, shelf and ISBN — but had nowhere
-- to put the year of publishing, the ORIGINAL language of a translated
-- work (distinct from the language of this copy), or a short blurb. Three
-- plain nullable columns; nothing else changes shape, no backfill (every
-- existing book simply shows "—" for them until the librarian fills them
-- in from the Add/Edit book form).
-- =============================================================================

alter table books add column publication_year  integer;
alter table books add column original_language text;
alter table books add column description       text;

alter table books add constraint books_publication_year_sane
  check (publication_year is null or (publication_year between 1000 and 2200));
