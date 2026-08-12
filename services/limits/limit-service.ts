/**
 * PROMPT EDU ERP — LimitService (ARCHITECTURE.md §W.2). Checks live usage
 * against an institution's subscription_plans row, exactly the shape §W.2
 * describes:
 *
 *   usage = latest usage_metrics row     <- this build computes LIVE counts
 *                                           instead (no scheduled rollup job
 *                                           exists yet — same honest scoping
 *                                           as getPlatformUsageOverview(),
 *                                           services/super-admin/
 *                                           super-admin-service.ts)
 *   limit = plan.max_<resource>
 *   pct = usage / limit
 *   -> soft warnings at 80%/95%; hard block only on the specific action
 *      that would exceed a hard limit, never a retroactive lockout of
 *      existing data (§W.2's own wording, followed literally below)
 *
 * `institutions.plan_id` is set automatically at creation time (both
 * seedDemoInstitution() and Super Admin's createInstitution() assign the
 * oldest active plan — the seeded "Starter" plan today) — a plan with a
 * null max_<resource> column means that resource is uncapped for that
 * plan, not "0 allowed"; every function here treats a missing plan/column
 * the same way (status "ok", limit null) rather than as an error.
 */
import { getDbClient } from "../db/client";
import type { DbClient } from "../db/client";

export type LimitResource = "students" | "staff" | "users" | "storage";

export interface LimitCheckResult {
  resource: LimitResource;
  used: number;
  limit: number | null; // null = this plan has no cap on this resource
  pct: number | null;
  status: "ok" | "warning" | "critical" | "exceeded";
}

const WARNING_THRESHOLD = 0.8;
const CRITICAL_THRESHOLD = 0.95;

function statusFor(used: number, limit: number | null): { pct: number | null; status: LimitCheckResult["status"] } {
  if (limit === null) return { pct: null, status: "ok" };
  const pct = limit === 0 ? 1 : used / limit;
  if (used >= limit) return { pct, status: "exceeded" };
  if (pct >= CRITICAL_THRESHOLD) return { pct, status: "critical" };
  if (pct >= WARNING_THRESHOLD) return { pct, status: "warning" };
  return { pct, status: "ok" };
}

interface PlanAndUsageRow {
  max_students: number | null;
  max_staff: number | null;
  max_users: number | null;
  max_storage_mb: number | null;
  student_count: number;
  staff_count: number;
  user_count: number;
  storage_mb: number;
}

async function fetchPlanAndUsage(scoped: DbClient, institutionId: string): Promise<PlanAndUsageRow | null> {
  const { rows } = await scoped.query<PlanAndUsageRow>(
    `select
       p.max_students, p.max_staff, p.max_users, p.max_storage_mb,
       coalesce((select count(*) from students s where s.institution_id = i.id), 0)::int as student_count,
       coalesce((select count(*) from staff st where st.institution_id = i.id), 0)::int as staff_count,
       coalesce((select count(distinct uim.user_id) from user_institution_memberships uim where uim.institution_id = i.id), 0)::int as user_count,
       coalesce((select sum(f.size_bytes) from files f where f.institution_id = i.id), 0)::numeric / (1024 * 1024) as storage_mb
     from institutions i
     left join subscription_plans p on p.id = i.plan_id
     where i.id = $1`,
    [institutionId]
  );
  return rows[0] ?? null;
}

function toResult(resource: LimitResource, row: PlanAndUsageRow): LimitCheckResult {
  const used = resource === "students" ? row.student_count
    : resource === "staff" ? row.staff_count
    : resource === "users" ? row.user_count
    : Math.ceil(Number(row.storage_mb));
  const limit = resource === "students" ? row.max_students
    : resource === "staff" ? row.max_staff
    : resource === "users" ? row.max_users
    : row.max_storage_mb;
  const { pct, status } = statusFor(used, limit);
  return { resource, used, limit, pct, status };
}

/** Single-resource check — used by dashboards ("Student capacity: 94%"). */
export async function checkLimit(institutionId: string, authUserId: string, resource: LimitResource): Promise<LimitCheckResult> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const row = await fetchPlanAndUsage(scoped, institutionId);
    if (!row) return { resource, used: 0, limit: null, pct: null, status: "ok" };
    return toResult(resource, row);
  });
}

/** All four resources in one query — the Institution Admin/Super Admin dashboard shape. */
export async function getInstitutionLimitsOverview(institutionId: string, authUserId: string): Promise<LimitCheckResult[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const row = await fetchPlanAndUsage(scoped, institutionId);
    const resources: LimitResource[] = ["students", "staff", "users", "storage"];
    if (!row) return resources.map((r) => ({ resource: r, used: 0, limit: null, pct: null, status: "ok" as const }));
    return resources.map((r) => toResult(r, row));
  });
}

/**
 * Hard block for the specific action that would exceed a hard limit
 * (§W.2's own example: "creating student #501 on a 500-cap plan") — NOT a
 * retroactive lockout of existing data; a plan downgrade that leaves an
 * institution already over its new cap is never enforced retroactively by
 * this function, only the NEXT attempt to create one more of that resource.
 *
 * Accepts the SAME scoped client a caller is already inside (mirrors the
 * §Q.1 scopedClient pattern used throughout this codebase) so the check
 * participates in the same transaction as the insert it's guarding,
 * without a second round trip. This is a best-effort, application-layer
 * check (not a DB-level constraint/lock) — sufficient to stop the common
 * case, not airtight against a genuine race between two simultaneous
 * requests at the exact boundary; a real concurrency guarantee would need
 * a database-level check constraint or advisory lock, tracked as a
 * follow-up if this ever becomes a precision-critical guarantee rather
 * than a capacity nudge.
 */
export async function assertBelowLimit(scoped: DbClient, institutionId: string, resource: LimitResource): Promise<void> {
  const row = await fetchPlanAndUsage(scoped, institutionId);
  if (!row) return;
  const result = toResult(resource, row);
  if (result.limit !== null && result.used >= result.limit) {
    throw new Error(
      `This institution has reached its plan limit for ${resource} (${result.used}/${result.limit}). Contact Prompt Innovations to upgrade the plan.`
    );
  }
}
