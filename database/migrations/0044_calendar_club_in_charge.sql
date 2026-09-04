-- =============================================================================
-- PROMPT EDU ERP — Migration 0044: Academic Calendar club-in-charge (§425)
--
-- §425 "add clubs in charge for events (may be optional)" — a free-text,
-- always-optional field naming which club/committee is running an event
-- (e.g. "Literary Club", "Nature Club"). Free text rather than a foreign
-- key into a clubs table: no "clubs" entity exists anywhere else in this
-- schema, and inventing a whole clubs module/CRUD for one optional label
-- would be well out of proportion to the actual ask (§K "never invent a
-- config table the request doesn't call for").
-- =============================================================================

alter table calendar_events add column club_in_charge text;

comment on column calendar_events.club_in_charge is
  'Optional: which student club/committee is organizing this event (§425). Free text, always optional.';
