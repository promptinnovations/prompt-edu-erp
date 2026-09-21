-- =============================================================================
-- PROMPT EDU ERP -- Migration 0053: Star of the Month announce gate (§9
-- follow-up: "will be announced by the institution admin after
-- verification once it is ready -- that's only required, do not do it
-- automatically").
--
-- Computing a month's winners (computeStarOfTheMonth()) used to make them
-- visible in everyone's login banner immediately. announced_at splits
-- "computed" from "published": null means a draft an admin can still
-- review/re-run before anyone else sees it; a timestamp means an admin
-- explicitly announced it. getCurrentStarOfTheMonth() (the banner query)
-- now only returns announced rows -- same nullable-timestamp-as-toggle
-- pattern as calendar_events.conducted_at (migration 0050).
-- =============================================================================

alter table star_of_the_month add column announced_at timestamptz;

comment on column star_of_the_month.announced_at is
  'When an institution admin announced this winner (visible in the login banner from then on). Null = computed but still a draft.';
