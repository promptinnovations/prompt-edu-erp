-- Supabase security advisor flagged the app's internal migration ledger as
-- missing RLS. Low risk (filenames only, no institution/personal data, not
-- reachable through any app-facing query path) but there's no reason to
-- leave it open — nothing legitimate ever needs to touch this table via
-- PostgREST/the anon or authenticated roles, only the migration runner
-- (which uses the privileged DB connection and bypasses RLS regardless).
alter table public._migrations enable row level security;
