-- =============================================================================
-- PROMPT EDU ERP — Migration 0024: Institution educational board
--
-- §137 follow-up ("while creating institution if madrasa is chosen as an
-- option, there should be 2 options titled as educational board — 1.
-- SKSVB 2. SKIMVB"). `board` is nullable and only meaningful when
-- institutions.type = 'madrasa' (enforced in application code, not a CHECK
-- constraint, so a madrasa that predates this feature — or one whose board
-- isn't yet modeled, e.g. a future 3rd board — isn't forced into one of
-- these two values). SKIMVB has no auto-provisioned configuration yet
-- (§137: "i will provide details of SKSVB now, later i will add the
-- latter") — selecting it today just records the choice.
-- =============================================================================

alter table institutions add column board text; -- sksvb|skimvb|null
