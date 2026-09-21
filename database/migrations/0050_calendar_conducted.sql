-- =============================================================================
-- PROMPT EDU ERP — Migration 0050: Academic Calendar "mark as conducted" (§10
-- follow-up: "tick events conducted")
--
-- A calendar event today is purely date-driven (§calendar/service.ts splits
-- "upcoming" vs "past" by comparing today's date against end_date/start_date)
-- — there was no way to record whether an event that has passed its date
-- actually happened. `conducted_at` is nullable: null means "not (yet)
-- marked conducted", a timestamp means when someone ticked it. Deliberately
-- NOT a boolean — keeping who/when is free (via the existing audit log) but
-- the timestamp itself is handy for "conducted late" reporting later without
-- another migration.
-- =============================================================================

alter table calendar_events add column conducted_at timestamptz;

comment on column calendar_events.conducted_at is
  'When this event was ticked as actually conducted (§10 "tick events conducted"). Null = not yet marked.';
