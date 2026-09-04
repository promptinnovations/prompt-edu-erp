/**
 * PROMPT EDU ERP — shared request-context types.
 * See services/request-context.ts for how these are assembled server-side
 * on every request (ARCHITECTURE.md §A.4 "resolve-on-server, enforce-twice").
 */

export interface AuthSession {
  authUserId: string; // maps to users.auth_user_id
  email: string | null;
}

export interface InstitutionMembership {
  institutionId: string;
  institutionCode: string;
  institutionName: string;
  isPrimary: boolean;
  /** institutions.status (active|inactive|suspended|trial, §W) — the
   *  membership row's own status ('active'/'invited'/etc., a SEPARATE
   *  concept) is already filtered to 'active' by getMembershipsForUser();
   *  this is the INSTITUTION's own status, checked by
   *  services/request-context.ts to block sign-in/writes for a
   *  suspended/inactive institution (Phase 18 follow-up, now enforced). */
  institutionStatus: string;
}

export interface RequestContext {
  session: AuthSession;
  userId: string; // users.id (internal), resolved from auth_user_id
  institutionId: string | null; // active institution for this request
  isSuperAdmin: boolean;
  memberships: InstitutionMembership[];
  permissions: Set<string>;
  /** Set when the resolved active institution's status is 'suspended' or
   *  'inactive' AND the caller is not a Super Admin (Super Admins are
   *  never blocked — they need access to inspect/reactivate). When set,
   *  institutionId/permissions above are deliberately left EMPTY/null
   *  (same shape as "no active institution at all") so every existing
   *  permission check still fails closed; UI layers use this field only
   *  to show a clear "why" instead of a bare redirect-to-login. */
  institutionBlockedReason: "suspended" | "inactive" | null;
  /** True only when institutionId above came from a Super Admin explicitly
   *  choosing "Open this institution's console" (services/request-
   *  context.ts's SUPER_ADMIN_VIEW_INSTITUTION_COOKIE), not from a real
   *  user_institution_memberships row. A "pure" Super Admin (§B.4) has no
   *  membership of their own anywhere, so this is the only way for them to
   *  actually use — not just read database rows for — an institution's
   *  modules. permissions is the FULL platform permission catalogue in
   *  this case (they have no role-based grant to check), matching what RLS
   *  already allows them unconditionally at the database layer. The
   *  (institution) layout shows a persistent "Viewing as Super Admin —
   *  Exit" banner whenever this is true, so it's never ambiguous whose
   *  data is on screen. */
  viewingInstitutionAsSuperAdmin: boolean;
  /** Set only when viewingInstitutionAsSuperAdmin is true AND the Super
   *  Admin picked a specific real person from /super-admin/sample-portals
   *  ("view as Principal/Management/Class Teacher/Student/Parent",
   *  services/super-admin/sample-portal-service.ts). When set, userId/
   *  session.authUserId above are OVERRIDDEN to that real person's own —
   *  not the Super Admin's — so every existing permission check,
   *  RLS `users_select_self`-style policy, and audit_logs.user_id
   *  attribution behaves exactly as if that person were signed in
   *  themselves (permissions is their genuine role-derived set, not the
   *  full catalogue viewingInstitutionAsSuperAdmin alone would grant —
   *  see services/request-context.ts). roleLabel is a cosmetic-only
   *  string ("Principal", "Class Teacher", …) for the banner; it is never
   *  used for any authorization decision. */
  viewingAsUser: { userId: string; fullName: string; roleLabel: string } | null;
}
