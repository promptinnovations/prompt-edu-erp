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
import { RESERVED_INSTITUTION_CODES } from "./reserved-codes";

export { RESERVED_INSTITUTION_CODES };

export interface InstitutionRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  board: string | null;
  status: string;
  deployment_mode: string;
  default_locale: string;
  created_at: string;
}

/** Educational boards with modeled configuration (§137 follow-up). Only
 *  meaningful when type = 'madrasa'. SKIMVB is accepted here (so the form
 *  can offer it and record the choice) but has no auto-provisioning yet —
 *  see provisionSksvbDefaults() below, which only runs for 'sksvb'. */
export const EDUCATIONAL_BOARDS = ["sksvb", "skimvb"] as const;

const INSTITUTION_STATUSES = ["active", "inactive", "suspended", "trial"] as const;

/** An institution's code doubles as its own real URL prefix
 *  (middleware.ts rewrites /<code>/... to the app's normal routes, §137
 *  follow-up "url should be different for each institution", extended by
 *  "I can't download different apps separately" into a real per-
 *  institution route namespace, not just a one-time deep-link redirect) —
 *  every real top-level app route (plus a few defensive extras for static
 *  assets) is reserved so a code can never shadow one. Checked at both
 *  creation (createInstitutionSchema below) and later edits
 *  (updateInstitutionCode). The actual Set now lives in ./reserved-codes.ts
 *  (no db/auth imports) so middleware.ts, which runs on the Edge runtime,
 *  can import it directly too — keep both in sync with app/'s actual
 *  top-level page.tsx/route.ts segments if new ones are ever added.
 */
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

/** Default permission grants for every non-institution_admin system role
 *  (§F.4). Found missing entirely for real, production-created institutions
 *  while building the §D.6 attendance-alerts follow-up: createInstitution()
 *  previously created these role ROWS but never granted them any
 *  role_permissions at all (only database/scripts/seed.ts's DEMO-only
 *  seedInstitutionDefaults() did) — every non-admin user at every
 *  institution created through this real, production path (Badrudhuja was
 *  the one exception, backfilled by hand earlier) had zero permissions and
 *  could do nothing in the app after logging in. Kept in exact sync with
 *  seed.ts's own `roleGrants` (same defaults, demo or real) — if one
 *  changes, update the other. */
const DEFAULT_ROLE_PERMISSION_GRANTS: Record<string, string[]> = {
  management: [
    "student.view_all", "marks.view", "marks.approve", "attendance.view", "attendance.edit",
    "achievements.verify", "achievements.approve", "skills.approve",
    "discipline.view", "portfolio.view_all", "reports.view", "reports.export", "audit.view",
    "staff.view", "staff.edit", "staff.portion.manage", "staff.observation.manage", "staff.assignment.manage",
    "mentoring.view_all", "data.import", "data.export", "announcements.publish", "announcements.view",
    "files.manage",
  ],
  teacher: [
    "student.view", "marks.view", "marks.enter", "marks.verify",
    "attendance.view", "attendance.enter", "attendance.leave.review_own_class", "skills.review",
    "achievements.submit", "portfolio.view_own", "discipline.record",
    "staff.view", "staff.portion.manage",
    "mentoring.view_own", "mentoring.create", "announcements.view",
  ],
  librarian: ["library.view", "library.issue", "library.return", "library.manage", "student.view", "announcements.view"],
  parent: ["student.view", "portfolio.view_own", "reports.view", "announcements.view", "attendance.leave.apply"],
  student: ["student.view", "portfolio.view_own", "skills.submit", "library.view", "achievements.submit", "announcements.view", "attendance.leave.apply"],
  staff: ["staff.view", "announcements.view"],
};

/** Default attendance statuses (§D.6, §36 "one status per institution must
 *  be is_default=true") — found missing entirely for real, production-
 *  created institutions during the same audit that found
 *  DEFAULT_ROLE_PERMISSION_GRANTS missing: createInstitution() never seeded
 *  attendance_statuses, so the "Take attendance" status dropdown had zero
 *  options (rendered as an empty select) at every institution created
 *  through this path until an admin manually added statuses. Same 5-status
 *  set as seed.ts's demo institutions and the one Badrudhuja already had. */
const DEFAULT_ATTENDANCE_STATUSES: Array<[string, string, boolean, boolean]> = [
  ["present",   "Present",   true,  true],
  ["absent",    "Absent",    false, false],
  ["late",      "Late",      true,  false],
  ["half_day",  "Half Day",  true,  false],
  ["on_leave",  "On Leave",  false, false],
];

export async function listInstitutions(authUserId: string): Promise<InstitutionRecord[]> {
  return withSuperAdminContext(authUserId, async (scoped) => {
    const { rows } = await scoped.query<InstitutionRecord>(
      `select id, code, name, type, board, status, deployment_mode, default_locale, created_at
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
      `select id, code, name, type, board, status, deployment_mode, default_locale, created_at
         from institutions where id = $1`,
      [institutionId]
    );
    return rows[0] ?? null;
  });
}

export interface InstitutionWhatsAppConfig {
  idInstance: string | null;
  apiTokenInstance: string | null;
}

/** §D.6 follow-up: "message for each institution should go from a number
 *  which is related to the institution which I will add for each
 *  institution" — one GREEN-API instance per institution (its own paired
 *  WhatsApp number), set by the platform owner here, not by the
 *  institution itself (see migration 0027's own doc comment for why this
 *  lives in Super Admin, not institution Settings). */
export async function getInstitutionWhatsAppConfig(authUserId: string, institutionId: string): Promise<InstitutionWhatsAppConfig> {
  return withSuperAdminContext(authUserId, async (scoped) => {
    const { rows } = await scoped.query<{ id_instance: string | null; token_instance: string | null }>(
      `select whatsapp_green_api_id_instance as id_instance, whatsapp_green_api_token_instance as token_instance
         from institutions where id = $1`,
      [institutionId]
    );
    return { idInstance: rows[0]?.id_instance ?? null, apiTokenInstance: rows[0]?.token_instance ?? null };
  });
}

const updateWhatsAppConfigSchema = z.object({
  idInstance: z.string().trim().max(100).nullable(),
  apiTokenInstance: z.string().trim().max(200).nullable(),
});

export async function updateInstitutionWhatsAppConfig(
  authUserId: string, institutionId: string, input: z.infer<typeof updateWhatsAppConfigSchema>
): Promise<void> {
  const data = updateWhatsAppConfigSchema.parse(input);
  return withSuperAdminContext(authUserId, async (scoped, callerUserId) => {
    await scoped.query(
      `update institutions
          set whatsapp_green_api_id_instance = $1, whatsapp_green_api_token_instance = $2, updated_at = now()
        where id = $3`,
      [data.idInstance || null, data.apiTokenInstance || null, institutionId]
    );
    await recordPlatformAudit(scoped, {
      actorUserId: callerUserId, institutionId, action: "update", entityType: "institutions",
      entityId: institutionId, after: { whatsappConfigured: !!(data.idInstance && data.apiTokenInstance) },
    });
  });
}

const createInstitutionSchema = z.object({
  code: institutionCodeSchema,
  name: z.string().min(1).max(200),
  type: z.enum(["madrasa", "islamic_school", "school", "college", "dars", "other"]).default("other"),
  // Only meaningful (and only offered by the form) when type = 'madrasa' —
  // §137 follow-up. Rejected below via superRefine if given for any other
  // type, and required when type IS 'madrasa', since selecting a board is
  // what drives auto-provisioning (provisionSksvbDefaults()).
  board: z.enum(EDUCATIONAL_BOARDS).optional(),
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
  if (data.type === "madrasa" && !data.board) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["board"], message: "Choose an educational board (SKSVB or SKIMVB) for a madrasa." });
  }
  if (data.type !== "madrasa" && data.board) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["board"], message: "Educational board only applies to madrasa institutions." });
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
      `insert into institutions (code, name, type, board, default_locale, status, plan_id)
       values ($1, $2, $3, $4, $5, 'trial', (select id from subscription_plans where is_active = true order by created_at asc limit 1))
       returning id, code, name, type, board, status, deployment_mode, default_locale, created_at`,
      [data.code, data.name, data.type, data.board ?? null, data.defaultLocale]
    );
    const institution = rows[0];

    // §137 follow-up ("all configurations, rules, subjects applicable for
    // the concerned must be applicable") — the one deliberate exception to
    // this function's usual "Super Admin creation never seeds domain
    // config" rule (see file header): a chosen board IS the domain config,
    // not an Institution Admin preference, so it's provisioned right here.
    if (data.board === "sksvb") {
      await provisionSksvbDefaults(scoped, institution.id);
    }

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
    // Every other system role's default grant — see DEFAULT_ROLE_PERMISSION_GRANTS's
    // own doc comment for why this was missing entirely before.
    for (const [roleCode, permCodes] of Object.entries(DEFAULT_ROLE_PERMISSION_GRANTS)) {
      await scoped.query(
        `insert into role_permissions (role_id, permission_id)
         select r.id, p.id from roles r, permissions p
          where r.institution_id = $1 and r.code = $2 and p.code = any($3::text[])
         on conflict do nothing`,
        [institution.id, roleCode, permCodes]
      );
    }
    // Default attendance statuses — see DEFAULT_ATTENDANCE_STATUSES's own
    // doc comment for why this was missing entirely before.
    for (const [code, label, countsAsPresent, isDefault] of DEFAULT_ATTENDANCE_STATUSES) {
      await scoped.query(
        `insert into attendance_statuses (institution_id, code, label, counts_as_present, is_default)
         values ($1, $2, $3, $4, $5)
         on conflict (institution_id, code) do nothing`,
        [institution.id, code, label, countsAsPresent, isDefault]
      );
    }

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
      entityId: institution.id, after: { code: institution.code, name: institution.name, type: institution.type, board: institution.board },
    });
    return institution;
  });
}

/** SKSVB syllabus (§137 follow-up, given verbatim by the platform owner) —
 *  classes 1–12, each with its own subject list. "Qur'an & Hifz" is the
 *  one PRACTICAL subject (present from class 2 onward): graded out of 20
 *  marks with no TE/CE split, unlike every other subject which uses
 *  TE(80)+CE(20)=100 (§137: "practical only 20, other subjects 80+20").
 *  `subjects.category` records that distinction ('practical' | null) so
 *  the examination module can tell them apart later without a schema
 *  change; `class_subjects.is_core` mirrors it (practical = not core) for
 *  any UI that already filters on that existing flag. */
const SKSVB_SYLLABUS: Record<string, string[]> = {
  "1": ["Thafheemul Qur'an", "Duroosul Islam", "Kithabath"],
  "2": ["Thajweedul Qur'an", "Kithabath", "Duroosul Islam", "Qur'an & Hifz"],
  "3": ["Duroos 1", "Duroos 2", "Fiqh", "Thajweed", "Qur'an & Hifz"],
  "4": ["Duroos 1", "Duroos 2", "Fiqh", "Thajweed", "Qur'an & Hifz"],
  "5": ["Duroos 1", "Duroos 2", "Fiqh", "Thajweed", "Qur'an & Hifz"],
  "6": ["Thareeq", "Fiqhul Islam", "Thazkiya & Thajweed", "Duroosul Aqa'id", "Qur'an & Hifz"],
  "7": ["Thareeq", "Fiqhul Islam", "Thazkiya & Thajweed", "Duroosul Aqa'id", "Qur'an & Hifz"],
  "8": ["Fiqhul Islam", "Thazkiyathul Vildan", "Duroosul Islam", "Qur'an & Hifz"],
  "9": ["Fiqhul Islam", "Thazkiyathul Vildan", "Duroosul Islam", "Qur'an & Hifz"],
  "10": ["Fiqhul Islam", "Thazkiyathul Vildan", "Duroosul Islam", "Qur'an & Hifz"],
  "11": ["Duroos 1", "Duroos 2", "Qur'an & Hifz"],
  "12": ["Duroos 1", "Duroos 2", "Qur'an & Hifz"],
};

const SKSVB_PRACTICAL_SUBJECT = "Qur'an & Hifz";

/** Runs inside createInstitution()'s own transaction (same `scoped`
 *  client) so a failure here rolls the whole institution creation back
 *  rather than leaving a half-configured institution behind.
 *
 *  Provisions: classes 1–12 (sort_order = class number so the UI's
 *  natural ordering matches §137's LP/UP/HS/HSS grouping without needing
 *  numeric class names — see app/(institution)/classes/page.tsx), every
 *  distinct subject the syllabus references, and each class's own
 *  class_subjects rows. Does NOT create exam_types/examinations/
 *  exam_subjects — those are per-academic-year instances an Institution
 *  Admin creates from Examinations (an institution has no academic year
 *  yet at creation time, see createAcademicYear() in
 *  modules/academic/service.ts). When they do, this institution's
 *  Qur'an & Hifz subjects should get a single 20-mark component and every
 *  other subject a TE(80) + CE(20) pair — documented here rather than
 *  built as a combined-result auto-computer, which the current
 *  single-examination-at-a-time results engine (computeResults() in
 *  modules/examination/service.ts) doesn't support yet. */
async function provisionSksvbDefaults(scoped: DbClient, institutionId: string): Promise<void> {
  const subjectIds = new Map<string, string>();
  const allSubjectNames = new Set<string>();
  for (const names of Object.values(SKSVB_SYLLABUS)) {
    for (const n of names) allSubjectNames.add(n);
  }
  for (const name of allSubjectNames) {
    const category = name === SKSVB_PRACTICAL_SUBJECT ? "practical" : null;
    const { rows } = await scoped.query<{ id: string }>(
      `insert into subjects (institution_id, name, category) values ($1, $2, $3)
       on conflict (institution_id, name) do update set category = excluded.category
       returning id`,
      [institutionId, name, category]
    );
    subjectIds.set(name, rows[0].id);
  }

  for (const [className, subjectNames] of Object.entries(SKSVB_SYLLABUS)) {
    const { rows: classRows } = await scoped.query<{ id: string }>(
      `insert into classes (institution_id, name, sort_order) values ($1, $2, $3)
       on conflict (institution_id, name) do update set sort_order = excluded.sort_order
       returning id`,
      [institutionId, className, Number(className)]
    );
    const classId = classRows[0].id;
    for (const subjectName of subjectNames) {
      const subjectId = subjectIds.get(subjectName)!;
      const isCore = subjectName !== SKSVB_PRACTICAL_SUBJECT;
      await scoped.query(
        `insert into class_subjects (institution_id, class_id, subject_id, is_core) values ($1, $2, $3, $4)
         on conflict (institution_id, class_id, subject_id) do update set is_core = excluded.is_core`,
        [institutionId, classId, subjectId, isCore]
      );
    }
  }
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
       returning id, code, name, type, board, status, deployment_mode, default_locale, created_at`,
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
 *  URL and its own /<code>/... route prefix (middleware.ts) — after
 *  creation (§137 follow-up: "area ...
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
      `select id, code, name, type, board, status, deployment_mode, default_locale, created_at from institutions where id = $1`,
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
       returning id, code, name, type, board, status, deployment_mode, default_locale, created_at`,
      [data.code, institutionId]
    );
    await recordPlatformAudit(scoped, {
      actorUserId: callerUserId, institutionId, action: "code_change", entityType: "institutions", entityId: institutionId,
      before: { code: before[0].code }, after: { code: data.code },
    });
    return rows[0];
  });
}

const updateBoardSchema = z.object({ board: z.enum(EDUCATIONAL_BOARDS) });

/** Sets/changes an existing madrasa institution's educational board — the
 *  edit-time counterpart of createInstitution()'s board field (§137
 *  follow-up "Educational Board selector for madrasa institutions" only
 *  wired up creation-time provisioning; a board set or corrected on an
 *  EXISTING institution — as MMP's was, via a direct SQL update before this
 *  function existed — silently got none of provisionSksvbDefaults()'s
 *  classes/subjects/class_subjects, since that function only ever ran
 *  inside createInstitution()). Calling this for board='sksvb' (re-)runs
 *  provisionSksvbDefaults(), which is safe to repeat: subjects/classes/
 *  class_subjects are all upserted with `on conflict do update`, so an
 *  institution whose classes already happen to match the syllabus's names
 *  (as MMP's do) gets subjects attached in place rather than duplicated. */
export async function updateInstitutionBoard(
  authUserId: string,
  institutionId: string,
  input: z.infer<typeof updateBoardSchema>
): Promise<InstitutionRecord | null> {
  const data = updateBoardSchema.parse(input);
  return withSuperAdminContext(authUserId, async (scoped, callerUserId) => {
    const { rows: before } = await scoped.query<{ type: string; board: string | null }>(
      "select type, board from institutions where id = $1", [institutionId]
    );
    if (before.length === 0) return null;
    if (before[0].type !== "madrasa") {
      throw new Error("Educational board only applies to madrasa institutions.");
    }

    const { rows } = await scoped.query<InstitutionRecord>(
      `update institutions set board = $1, updated_at = now() where id = $2
       returning id, code, name, type, board, status, deployment_mode, default_locale, created_at`,
      [data.board, institutionId]
    );
    if (data.board === "sksvb") {
      await provisionSksvbDefaults(scoped, institutionId);
    }
    await recordPlatformAudit(scoped, {
      actorUserId: callerUserId, institutionId, action: "board_change", entityType: "institutions", entityId: institutionId,
      before: { board: before[0].board }, after: { board: data.board },
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
