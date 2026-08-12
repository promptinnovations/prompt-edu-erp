/**
 * PROMPT EDU ERP — SuperAdminService (ARCHITECTURE.md §B.4, §W). Every
 * function here re-verifies the caller is genuinely a platform Super Admin
 * by re-resolving their role SERVER-SIDE (resolveUserByAuthId), never by
 * trusting a boolean the caller already checked upstream (§X.2 rule 2,
 * "role claims re-derived server-side per request") — this is the one
 * place in the codebase where getting that check wrong means true
 * cross-tenant access, so it is deliberately redundant with the
 * requireSuperAdminContext() check every (super-admin) page/action also
 * performs.
 *
 * Institution creation here provisions the same generic, non-negotiable
 * bootstrapping every institution needs (system role templates, Institution
 * Admin's full grant) — §F "system role templates copied at onboarding" —
 * but deliberately does NOT seed domain/demo data (exam types, achievement
 * categories, module enablement, etc.). That configuration is an
 * Institution Admin's own job after onboarding (§23), not something Super
 * Admin dictates on their behalf; `database/scripts/seed.ts`'s
 * `seedDemoInstitution()` remains a separate, demo-only helper for local
 * dev/tests and never shares code with this function for that reason.
 */
import { z } from "zod";
import { getDbClient } from "../db/client";
import type { DbClient } from "../db/client";
import { resolveUserByAuthId } from "../tenant/tenant-service";
import { recordPlatformAudit } from "../audit/audit-service";
import { getAuthService } from "../auth/auth-service";

export interface InstitutionRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  deployment_mode: string;
  default_locale: string;
  created_at: string;
}

const INSTITUTION_STATUSES = ["active", "inactive", "suspended", "trial"] as const;

/** An institution's code doubles as its shareable deep-link path
 *  (app/[code]/route.ts, §137 follow-up "url should be different for each
 *  institution") — every real top-level app route (plus a few defensive
 *  extras for static assets) is reserved so a code can never shadow one.
 *  Checked at both creation (createInstitutionSchema below) and later edits
 *  (updateInstitutionCode). Keep in sync with app/'s actual top-level
 *  page.tsx/route.ts segments if new ones are ever added. */
export const RESERVED_INSTITUTION_CODES = new Set([
  "academic", "achievements", "analytics", "announcements", "attendance",
  "dashboard", "discipline", "examinations", "import", "library", "login",
  "mentoring", "module-unavailable", "reports", "scoring", "settings",
  "skills", "staff", "storage", "students", "super-admin", "suspended",
  "users", "portal", "api", "icons", "favicon.ico", "manifest.webmanifest",
  "robots.txt", "sitemap.xml", "sw.js", "_next",
]);

const institutionCodeSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, "Code must be lowercase letters, numbers, and hyphens only.")
  .refine((code) => !RESERVED_INSTITUTION_CODES.has(code), {
    message: "That code is reserved by the app itself — please choose a different one.",
  });

async function withSuperAdminContext<T>(authUserId: string, fn: (scoped: DbClient, callerUserId: string) => Promise<T>): Promise<T> {
  const resolved = await resolveUserByAuthId(authUserId);
  if (!resolved || !resolved.isSuperAdmin) {
    throw new Error("Forbidden: this action requires the platform Super Admin role.");
  }
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: null, authUserId, isSuperAdmin: true }, (scoped) => fn(scoped, resolved.userId));
}

const SYSTEM_ROLES: Array<[string, string]> = [
  ["institution_admin", "Institution Admin"],
  ["management", "Principal / Management"],
  ["teacher", "Teacher"],
  ["staff", "Staff"],
  ["librarian", "Librarian"],
  ["parent", "Parent"],
  ["student", "Student"],
];

export async function listInstitutions(authUserId: string): Promise<InstitutionRecord[]> {
  return withSuperAdminContext(authUserId, async (scoped) => {
    const { rows } = await scoped.query<InstitutionRecord>(
      `select id, code, name, type, status, deployment_mode, default_locale, created_at
         from institutions order by created_at desc`
    );
    return rows;
  });
}

/** Used by services/request-context.ts to validate a Super Admin's "view
 *  this institution" override cookie before honoring it — a stale cookie
 *  pointing at a deleted institution must not silently resolve to garbage. */
export async function getInstitutionForSuperAdmin(authUserId: string, institutionId: string): Promise<InstitutionRecord | null> {
  return withSuperAdminContext(authUserId, async (scoped) => {
    const { rows } = await scoped.query<InstitutionRecord>(
      `select id, code, name, type, status, deployment_mode, default_locale, created_at
         from institutions where id = $1`,
      [institutionId]
    );
    return rows[0] ?? null;
  });
}

const createInstitutionSchema = z.object({
  code: institutionCodeSchema,
  name: z.string().min(1).max(200),
  type: z.enum(["madrasa", "islamic_school", "school", "college", "dars", "other"]).default("other"),
  defaultLocale: z.enum(["en", "ml"]).default("en"),
  // Optional as a TRIO, not individually — either all three are given (the
  // form always sends all three together) or none are, so createInstitution()
  // never has to guess what a caller meant by providing just one.
  adminEmail: z.string().email().optional(),
  adminFullName: z.string().min(1).max(200).optional(),
  adminPassword: z.string().min(8, "Password must be at least 8 characters.").optional(),
}).superRefine((data, ctx) => {
  const given = [data.adminEmail, data.adminFullName, data.adminPassword].filter((v) => !!v);
  if (given.length > 0 && given.length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "To create the institution's first admin account, provide their email, full name, and a password (8+ characters) together — or leave all three blank to add an admin later from Users & Roles.",
    });
  }
});

/** Creates the institution row plus the generic system-role scaffolding
 *  every institution needs to function (§F) — see file header for what is
 *  and isn't provisioned here. When adminEmail/adminFullName/adminPassword
 *  are given, also provisions a REAL, immediately-usable admin account —
 *  the one deliberate exception to this app's "nobody's password ever
 *  passes through the server" default (see AuthService.adminCreateUser's
 *  own doc comment). The whole thing is one transaction: if the admin
 *  account can't be provisioned, the institution is NOT created either
 *  (nothing worse than a form re-submission for the caller), and if the
 *  auth account was created but the follow-up DB rows then fail for some
 *  other reason, adminDeleteUser() best-effort cleans it up before the
 *  error propagates. */
export async function createInstitution(
  authUserId: string,
  input: z.infer<typeof createInstitutionSchema>
): Promise<InstitutionRecord> {
  const data = createInstitutionSchema.parse(input);
  return withSuperAdminContext(authUserId, async (scoped, callerUserId) => {
    // Fail fast, before creating anything, if the admin email is already
    // taken platform-wide — cheaper than discovering it after a real
    // Supabase Auth account has already been provisioned.
    if (data.adminEmail) {
      const { rows: existing } = await scoped.query<{ id: string }>("select id from users where email = $1", [data.adminEmail]);
      if (existing.length > 0) {
        throw new Error(`A user with email "${data.adminEmail}" already exists on the platform — reusing an existing account as a new institution's admin isn't supported yet.`);
      }
    }

    // plan_id defaults to the oldest active subscription plan (the seeded
    // "Starter" plan today) — §W.2's LimitService has nothing to check
    // against otherwise. An institution can be moved to a different plan
    // later the same way any other configuration changes (a future Super
    // Admin action, not built as its own UI yet — see docs/SETUP.md).
    const { rows } = await scoped.query<InstitutionRecord>(
      `insert into institutions (code, name, type, default_locale, status, plan_id)
       values ($1, $2, $3, $4, 'trial', (select id from subscription_plans where is_active = true order by created_at asc limit 1))
       returning id, code, name, type, status, deployment_mode, default_locale, created_at`,
      [data.code, data.name, data.type, data.defaultLocale]
    );
    const institution = rows[0];

    for (const [roleCode, roleName] of SYSTEM_ROLES) {
      await scoped.query(
        `insert into roles (institution_id, code, name, is_system_role) values ($1, $2, $3, true)
         on conflict (institution_id, code) do nothing`,
        [institution.id, roleCode, roleName]
      );
    }
    // Institution Admin gets every non-platform permission by default (§F.4)
    // — the same grant seedDemoInstitution() gives it, and the one
    // genuinely universal default every real institution needs on day one.
    await scoped.query(
      `insert into role_permissions (role_id, permission_id)
       select r.id, p.id from roles r, permissions p
        where r.institution_id = $1 and r.code = 'institution_admin' and p.module <> 'super_admin'
       on conflict do nothing`,
      [institution.id]
    );

    if (data.adminEmail && data.adminFullName && data.adminPassword) {
      const authService = await getAuthService();
      const authResult = await authService.adminCreateUser(data.adminEmail, data.adminPassword);
      if ("error" in authResult) {
        throw new Error(`Could not create the admin account (${authResult.error}) — the institution was not created either, since both happen together. Fix the issue and try again.`);
      }
      try {
        // Safe to RETURNING here (unlike modules/staff/service.ts's
        // createStaffMember() and services/users/user-management-
        // service.ts's createInstitutionUser(), which both explicitly
        // avoid it) — this whole function already runs with
        // app.is_super_admin='true' (withSuperAdminContext), which
        // users_select_self's RLS policy explicitly bypasses, so the
        // "row not visible yet, no membership exists" problem those two
        // functions work around never applies here.
        const { rows: userRows } = await scoped.query<{ id: string }>(
          `insert into users (auth_user_id, email, full_name, preferred_locale) values ($1, $2, $3, 'en') returning id`,
          [authResult.authUserId, data.adminEmail, data.adminFullName]
        );
        const adminUserId = userRows[0].id;

        await scoped.query(
          `insert into user_institution_memberships (user_id, institution_id, status, is_primary) values ($1, $2, 'active', true)`,
          [adminUserId, institution.id]
        );

        const { rows: roleRows } = await scoped.query<{ id: string }>(
          `select id from roles where institution_id = $1 and code = 'institution_admin'`,
          [institution.id]
        );
        await scoped.query(
          `insert into user_roles (user_id, institution_id, role_id) values ($1, $2, $3)`,
          [adminUserId, institution.id, roleRows[0].id]
        );

        await recordPlatformAudit(scoped, {
          actorUserId: callerUserId, institutionId: institution.id, action: "create", entityType: "users",
          entityId: adminUserId, after: { email: data.adminEmail, fullName: data.adminFullName, roleCode: "institution_admin" },
        });
      } catch (err) {
        await authService.adminDeleteUser(authResult.authUserId);
        throw err;
      }
    }

    await recordPlatformAudit(scoped, {
      actorUserId: callerUserId, institutionId: institution.id, action: "create", entityType: "institutions",
      entityId: institution.id, after: { code: institution.code, name: institution.name, type: institution.type },
    });
    return institution;
  });
}

const updateStatusSchema = z.object({ status: z.enum(INSTITUTION_STATUSES) });

export async function updateInstitutionStatus(
  authUserId: string,
  institutionId: string,
  input: z.infer<typeof updateStatusSchema>
): Promise<InstitutionRecord | null> {
  const data = updateStatusSchema.parse(input);
  return withSuperAdminContext(authUserId, async (scoped, callerUserId) => {
    const { rows: before } = await scoped.query<{ status: string }>("select status from institutions where id = $1", [institutionId]);
    if (before.length === 0) return null;

    const { rows } = await scoped.query<InstitutionRecord>(
      `update institutions set status = $1, updated_at = now() where id = $2
       returning id, code, name, type, status, deployment_mode, default_locale, created_at`,
      [data.status, institutionId]
    );
    await recordPlatformAudit(scoped, {
      actorUserId: callerUserId, institutionId, action: "status_change", entityType: "institutions", entityId: institutionId,
      before: { status: before[0].status }, after: { status: data.status },
    });
    return rows[0];
  });
}

const updateCodeSchema = z.object({ code: institutionCodeSchema });

/** Changes an institution's code — and therefore its shareable deep-link
 *  URL (app/[code]/route.ts) — after creation (§137 follow-up: "area ...
 *  should be editable"). Uniqueness is enforced by the same `institutions
 *  .code` unique constraint creation already relies on; caught here and
 *  turned into a friendly message instead of a raw Postgres error leaking
 *  to the UI. */
export async function updateInstitutionCode(
  authUserId: string,
  institutionId: string,
  input: z.infer<typeof updateCodeSchema>
): Promise<InstitutionRecord | null> {
  const data = updateCodeSchema.parse(input);
  return withSuperAdminContext(authUserId, async (scoped, callerUserId) => {
    const { rows: before } = await scoped.query<InstitutionRecord & { code: string }>(
      `select id, code, name, type, status, deployment_mode, default_locale, created_at from institutions where id = $1`,
      [institutionId]
    );
    if (before.length === 0) return null;
    if (before[0].code === data.code) return before[0]; // no-op, nothing to change or audit

    const { rows: clash } = await scoped.query<{ id: string }>("select id from institutions where code = $1 and id <> $2", [data.code, institutionId]);
    if (clash.length > 0) {
      throw new Error(`Code "${data.code}" is already used by another institution — pick a different one.`);
    }

    const { rows } = await scoped.query<InstitutionRecord>(
      `update institutions set code = $1, updated_at = now() where id = $2
       returning id, code, name, type, status, deployment_mode, default_locale, created_at`,
      [data.code, institutionId]
    );
    await recordPlatformAudit(scoped, {
      actorUserId: callerUserId, institutionId, action: "code_change", entityType: "institutions", entityId: institutionId,
      before: { code: before[0].code }, after: { code: data.code },
    });
    return rows[0];
  });
}

export interface InstitutionUsageRow {
  institution_id: string;
  institution_name: string;
  institution_code: string;
  status: string;
  student_count: number;
  staff_count: number;
  user_count: number;
  file_count: number;
  storage_bytes: number;
}

/**
 * §W.3 Super Admin dashboard data — composed live from existing tables
 * (institutions, students, staff, files) rather than the scheduled
 * `usage_metrics` rollup job described in §W.1, which (like the
 * analytics-refresh and consolidated-score-recompute jobs documented
 * elsewhere in this build — see docs/SETUP.md) has no job runner wired up
 * yet. `usage_metrics` itself, its RLS, and its schema all already exist
 * (migration 0001) and are ready to receive that job's writes once a
 * scheduler exists; this function is the same honest, on-demand
 * substitute this codebase uses consistently for that whole class of
 * "should be a scheduled job" feature.
 */
export async function getPlatformUsageOverview(authUserId: string): Promise<InstitutionUsageRow[]> {
  return withSuperAdminContext(authUserId, async (scoped) => {
    const { rows } = await scoped.query<InstitutionUsageRow>(
      `select
         i.id as institution_id, i.name as institution_name, i.code as institution_code, i.status,
         coalesce((select count(*) from students s where s.institution_id = i.id), 0)::int as student_count,
         coalesce((select count(*) from staff st where st.institution_id = i.id), 0)::int as staff_count,
         coalesce((select count(distinct uim.user_id) from user_institution_memberships uim where uim.institution_id = i.id), 0)::int as user_count,
         coalesce((select count(*) from files f where f.institution_id = i.id), 0)::int as file_count,
         coalesce((select sum(f.size_bytes) from files f where f.institution_id = i.id), 0)::bigint as storage_bytes
       from institutions i
       order by i.created_at desc`
    );
    return rows;
  });
}

export interface PlatformAuditRow {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  institution_id: string | null;
  institution_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

export async function listPlatformAuditLogs(authUserId: string, limit = 100): Promise<PlatformAuditRow[]> {
  return withSuperAdminContext(authUserId, async (scoped) => {
    const { rows } = await scoped.query<PlatformAuditRow>(
      `select pal.id, pal.actor_user_id, u.full_name as actor_name, pal.institution_id, i.name as institution_name,
              pal.action, pal.entity_type, pal.entity_id, pal.created_at
         from platform_audit_logs pal
         left join users u on u.id = pal.actor_user_id
         left join institutions i on i.id = pal.institution_id
        order by pal.created_at desc
        limit $1`,
      [limit]
    );
    return rows;
  });
}
