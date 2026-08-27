-- =============================================================================
-- PROMPT EDU ERP — Migration 0040: curated colour-combination palettes.
--
-- Follow-up ("never use dark ... give colour combination options, let them
-- choose best for them, even in Super Admin's console"): replaces the
-- single hex `institutions.primary_color` (provisioned in 0001, wired for
-- self-service write by 0020, but never actually rendered anywhere — the
-- fixed-palette design refresh in task #156/157 retired its UI before it
-- shipped) with a small fixed PALETTE ID, matching
-- services/branding/palettes.ts's THEME_PALETTES catalogue. An institution
-- (or the platform default, for the generic /login and the Super Admin
-- console itself) now always picks a whole, pre-matched, contrast-checked
-- combination — never an arbitrary raw hex.
--
-- Column is renamed rather than left as `primary_color` with a new
-- meaning — a stored value that already looks like a hex string
-- ("#2563eb") would otherwise silently coexist with the new palette-id
-- convention ("navy-teal") and be ambiguous to any code (or person) reading
-- the column later. No live production row has ever had this column
-- populated (the write path was never reachable — see institution-service.
-- ts's history), so this is a pure, safe rename with no data migration.
-- =============================================================================

alter table institutions rename column primary_color to theme_palette;

comment on column institutions.theme_palette is
  'Palette id from services/branding/palettes.ts THEME_PALETTES (e.g. ''navy-teal''), or null to use the platform default (platform_settings.default_theme_palette).';

-- ---------------------------------------------------------------------------
-- platform_settings: a tiny, generic key/value table for platform-wide
-- (not per-institution) configuration — right now just the default theme
-- palette used by (a) the Super Admin console's own chrome and (b) the
-- generic /login screen reached with no institution context at all — but
-- deliberately generic-shaped so a future platform-wide toggle doesn't need
-- its own bespoke table.
--
-- RLS mirrors the standard super-admin-only pattern used throughout 0001
-- for platform-scoped tables (current_setting('app.is_super_admin', true)):
-- only a real Super Admin write can change it. Reads for pre-authentication
-- pages (the generic /login) go through the same
-- withInstitutionContext({ institutionId: null, isSuperAdmin: true }) bypass
-- services/institution/institution-service.ts's getInstitutionPublicSummaryByCode()
-- already uses — a deliberate, narrow, application-layer decision to expose
-- ONE non-sensitive value pre-auth, not a public RLS policy.
-- ---------------------------------------------------------------------------
create table platform_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

alter table platform_settings enable row level security;

create policy platform_settings_super_admin on platform_settings for all
  using (current_setting('app.is_super_admin', true) = 'true')
  with check (current_setting('app.is_super_admin', true) = 'true');

insert into platform_settings (key, value) values ('default_theme_palette', 'navy-teal');
