-- =============================================================================
-- PROMPT EDU ERP — Migration 0027: per-institution WhatsApp (GREEN-API) config
-- ARCHITECTURE.md §D.6/§G.4 attendance-alerts follow-up.
--
-- "i will purchase green API integrate- message for each institution should
-- go from a number which is related to the institution which i will add for
-- each institution" — each institution gets its OWN GREEN-API instance
-- (its own paired WhatsApp number), not one shared platform-wide number.
-- Stored on `institutions` (same home as the other per-institution config
-- columns this table already has: board, primary_color, app_name, ...),
-- set by the platform owner via Super Admin -> institution detail (not
-- institution self-service — these are Prompt Innovations' own purchased
-- GREEN-API instances, one per institution, not something an institution
-- admin acquires themselves).
-- =============================================================================

alter table institutions
  add column whatsapp_green_api_id_instance    text,
  add column whatsapp_green_api_token_instance text;
