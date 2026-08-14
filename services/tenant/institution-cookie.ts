/**
 * PROMPT EDU ERP — the one cookie name that means "this is the
 * institution the current browser session is scoped to". Deliberately a
 * standalone module with NO other imports (no db client, no auth
 * service): both services/request-context.ts (Node runtime) AND
 * middleware.ts (Edge runtime, cannot import anything that pulls in the
 * Node-only Postgres client) need this exact same string, so it lives
 * here instead of being duplicated/hardcoded in either place.
 */
export const ACTIVE_INSTITUTION_COOKIE = "perp_active_institution_code";
