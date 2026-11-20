-- =============================================================================
-- PROMPT EDU ERP — Migration 0071: Library upkeep ("fill gaps in Library").
--
--   book_holds.status + 'expired' — a "ready to collect" booking (the
--     student tapped "Take this book", or their waitlisted book came back)
--     that is not collected within the institution's collect-within days
--     (library settings, default 3) lapses, and the copy passes to the next
--     student waiting for that book.
--   book_copies.status + 'withdrawn' — a copy taken out of circulation
--     (given away, worn out) from the new book edit page, kept for history
--     instead of deleted.
-- The original checks were unnamed table checks, so Postgres named them
-- <table>_status_check.
-- =============================================================================

alter table book_holds drop constraint if exists book_holds_status_check;
alter table book_holds add constraint book_holds_status_check
  check (status in ('pending', 'notified', 'fulfilled', 'cancelled', 'expired'));

alter table book_copies drop constraint if exists book_copies_status_check;
alter table book_copies add constraint book_copies_status_check
  check (status in ('available', 'issued', 'lost', 'damaged', 'withdrawn'));
