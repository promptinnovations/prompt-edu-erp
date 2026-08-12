/**
 * PROMPT EDU ERP — AuditService (ARCHITECTURE.md §Y). Every mutating module
 * service call routes through recordAudit() inside the SAME transaction as
 * the underlying change (§Y.2 "never a best-effort side channel").
 */
import type { DbClient } from "../db/client";

export async function recordAudit(
  scoped: DbClient,
  params: {
    institutionId: string;
    userId: string | null;
    action: string;
    module: string;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
  }
) {
  await scoped.query(
    `insert into audit_logs (institution_id, user_id, action, module, entity_type, entity_id, before_jsonb, after_jsonb)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.institutionId,
      params.userId,
      params.action,
      params.module,
      params.entityType,
      params.entityId,
      params.before ? JSON.stringify(params.before) : null,
      params.after ? JSON.stringify(params.after) : null,
    ]
  );
}

/**
 * Platform-level / cross-tenant audit trail (§Y.1, §Y.3 "Super Admin able
 * to view platform-wide audit activity ... itself an audited action").
 * Writes to platform_audit_logs (migration 0001), NOT institution-scoped
 * audit_logs — used only by services/super-admin/super-admin-service.ts.
 * institutionId is nullable here (unlike recordAudit()) because some
 * platform actions (e.g. listing all institutions) target no single
 * institution; RLS on platform_audit_logs (§B.4) permits insert
 * unconditionally (the application layer is the only thing that ever calls
 * this, always from an already-verified super admin context) but restricts
 * SELECT to is_super_admin sessions only.
 */
export async function recordPlatformAudit(
  scoped: DbClient,
  params: {
    actorUserId: string | null;
    institutionId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
  }
) {
  await scoped.query(
    `insert into platform_audit_logs (actor_user_id, institution_id, action, entity_type, entity_id, before_jsonb, after_jsonb)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.actorUserId,
      params.institutionId,
      params.action,
      params.entityType,
      params.entityId,
      params.before ? JSON.stringify(params.before) : null,
      params.after ? JSON.stringify(params.after) : null,
    ]
  );
}
