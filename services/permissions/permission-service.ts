/**
 * PROMPT EDU ERP — PermissionService (ARCHITECTURE.md §F.2 "Permission check
 * pattern").
 *
 * Permissions are always checked by CODE (e.g. "student.create"), never by
 * role name — this is what lets an institution create custom roles composed
 * from the same permission catalogue without any code change (§F.1/§23).
 */
import { getDbClient } from "../db/client";

export async function getPermissionsForUser(
  authUserId: string,
  userId: string,
  institutionId: string
): Promise<Set<string>> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ code: string }>(
      `select distinct p.code
         from user_roles ur
         join role_permissions rp on rp.role_id = ur.role_id
         join permissions p on p.id = rp.permission_id
        where ur.user_id = $1 and ur.institution_id = $2`,
      [userId, institutionId]
    );
    return new Set(rows.map((r) => r.code));
  });
}

/** Role CODES (not permissions) for a user at an institution — used where
 *  the decision genuinely depends on which role this is (e.g. §Z's portal
 *  routing: a pure "student"/"parent" role goes to (portals), not
 *  (institution)), never for authorization itself (§F.2 "always by
 *  permission code, never by role name" — this is the one deliberate,
 *  narrowly-scoped exception, for routing only). */
export async function getRoleCodesForUser(
  authUserId: string,
  userId: string,
  institutionId: string
): Promise<Set<string>> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ code: string }>(
      `select distinct r.code from user_roles ur
         join roles r on r.id = ur.role_id
        where ur.user_id = $1 and ur.institution_id = $2`,
      [userId, institutionId]
    );
    return new Set(rows.map((r) => r.code));
  });
}

/** Every institution-scoped permission code that exists (excludes
 *  'super_admin'-module platform.* codes, which are checked via
 *  ctx.isSuperAdmin directly, not this permission set — see
 *  services/super-admin/super-admin-service.ts). Used by
 *  services/request-context.ts to grant a Super Admin viewing an
 *  institution via the override cookie the SAME full access an
 *  institution_admin role grant already gives every real admin (§F.4) —
 *  they have no role row of their own there, so there is nothing to derive
 *  permissions FROM otherwise, and RLS already lets them do anything in
 *  that institution regardless of this application-layer set. */
export async function getAllInstitutionPermissionCodes(): Promise<Set<string>> {
  const db = await getDbClient();
  const { rows } = await db.query<{ code: string }>(
    `select code from permissions where module <> 'super_admin'`
  );
  return new Set(rows.map((r) => r.code));
}

export function can(permissions: Set<string>, permissionCode: string): boolean {
  return permissions.has(permissionCode);
}

/** Server-side guard — throws rather than silently proceeding (§X "never trust the client"). */
export function requirePermission(permissions: Set<string>, permissionCode: string): void {
  if (!can(permissions, permissionCode)) {
    throw new Error(`Forbidden: missing permission "${permissionCode}"`);
  }
}
